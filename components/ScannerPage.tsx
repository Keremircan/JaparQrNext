"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CameraOff } from "lucide-react";
import { useSession } from "../context/useSession";
import {
  CameraError,
  openBackCamera,
  stopStream,
  type CameraErrorKind,
} from "../lib/scanner/camera";
import type {
  DecodeRequest,
  DecodeResponse,
} from "../lib/scanner/decoder.worker";
import {
  DEVICE_UNSUPPORTED_MESSAGE,
  DeviceUnsupportedError,
  signedPost,
} from "../lib/deviceId";
import "../styles/ScannerPage.css";

// Analiz için kareden kesilen orta bölgenin azami kenarı (px). Kamera
// çözünürlüğü bunun altındaysa ölçekleme yapılmaz, pikseller olduğu gibi gider.
const MAX_DECODE_SIZE = 1080;
const SCAN_INTERVAL_MS = 70;

const CAMERA_ERROR_TEXT: Record<
  CameraErrorKind,
  { title: string; desc: string }
> = {
  denied: {
    title: "Kamera İzni Gerekli",
    desc: "Giriş/çıkış doğrulaması yapabilmek için tarayıcınızın kamera iznini onaylamanız gerekmektedir.",
  },
  insecure: {
    title: "Kamera Kullanılamıyor",
    desc: "Kamera yalnızca güvenli (HTTPS) bağlantıda açılabilir. Lütfen uygulamayı https adresinden açın.",
  },
  notfound: {
    title: "Kamera Bulunamadı",
    desc: "Bu cihazda kullanılabilir bir arka kamera bulunamadı.",
  },
  busy: {
    title: "Kamera Meşgul",
    desc: "Kamera başka bir uygulama tarafından kullanılıyor olabilir. Diğer uygulamaları kapatıp yeniden deneyin.",
  },
  unknown: {
    title: "Kamera Açılamadı",
    desc: "Kamera başlatılırken beklenmeyen bir hata oluştu. Lütfen yeniden deneyin.",
  },
};

export default function ScannerPage() {
  const { employee, setLastType } = useSession();
  const router = useRouter();

  const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resultModal, setResultModal] = useState<{
    open: boolean;
    success: boolean;
    title: string;
    message: string;
  }>({
    open: false,
    success: false,
    title: "",
    message: "",
  });

  const isScanningLocked = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // IN / OUT tespiti
  const scanType: "IN" | "OUT" = employee?.lastType === "IN" ? "OUT" : "IN";
  const employeeId = employee?.employeeCode ?? "EMP-00000";

  const triggerVibrate = (pattern: number | number[] = 30) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // İzin yoksa yoksay
      }
    }
  };

  const resetScanner = useCallback(() => {
    setResultModal({ open: false, success: false, title: "", message: "" });
    setTimeout(() => {
      isScanningLocked.current = false;
    }, 1200);
  }, []);

  const handleBarcodeScanned = useCallback(
    async (decodedText: string) => {
      if (isScanningLocked.current) return;

      isScanningLocked.current = true;
      setLoading(true);
      triggerVibrate(40);

      try {
        // İstek cihaz anahtarıyla imzalanır (bkz. lib/deviceId.ts)
        const response = await signedPost("/api/verify", {
          qrData: decodedText,
          employeeId,
          type: scanType,
        });

        const result = await response.json();

        if (response.ok && result.success) {
          triggerVibrate([40, 60, 40]);
          // Durumu güncelle (IN yapıldıysa OUT'a hazırla, OUT yapıldıysa IN'e hazırla)
          setLastType(scanType);

          setResultModal({
            open: true,
            success: true,
            title: "İşlem Başarılı",
            message: `${result.message}\nKapı: ${result.gate}`,
          });
        } else {
          triggerVibrate([60, 60, 60]);
          setResultModal({
            open: true,
            success: false,
            title:
              typeof result.code === "string" &&
              result.code.startsWith("DEVICE_")
                ? "Yetkisiz Cihaz"
                : "İşlem Reddedildi",
            message: result.message || "Kod doğrulanamadı.",
          });
        }
      } catch (error) {
        triggerVibrate([60, 60, 60]);
        setResultModal({
          open: true,
          success: false,
          title:
            error instanceof DeviceUnsupportedError
              ? "Cihaz Doğrulanamadı"
              : "Bağlantı Hatası",
          message:
            error instanceof DeviceUnsupportedError
              ? DEVICE_UNSUPPORTED_MESSAGE
              : "Sunucuya erişilemedi. Wi-Fi bağlantınızı kontrol edin.",
        });
      } finally {
        setLoading(false);
      }
    },
    [employeeId, scanType, setLastType],
  );

  // Kamera effect'i her render'da yeniden kurulmasın diye güncel callback
  // ref üzerinden okunur (aksi halde her okutmada kamera kapanıp açılır).
  const onScanRef = useRef(handleBarcodeScanned);
  useEffect(() => {
    onScanRef.current = handleBarcodeScanned;
  }, [handleBarcodeScanned]);

  // Kamera + çözücü worker yaşam döngüsü
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let disposed = false;
    let stream: MediaStream | null = null;
    let generation = 0; // üst üste binen start/stop çağrılarını ayırt eder
    let workerBusy = false;

    const worker = new Worker(
      new URL("../lib/scanner/decoder.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
      const message = event.data;
      if (message.type === "fatal") {
        console.error("QR çözücü yüklenemedi:", message.message);
        return;
      }
      if (message.type !== "result") return;
      workerBusy = false;
      if (message.text && !isScanningLocked.current) {
        void onScanRef.current(message.text);
      }
    };

    // Analiz tuvali DOM'a hiç eklenmez; ekrandaki <video>'nun CSS boyutundan
    // bağımsız olarak kameranın gerçek piksellerinden beslenir.
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const scanFrame = () => {
      if (workerBusy || isScanningLocked.current || !context) return;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      const { videoWidth, videoHeight } = video;
      if (!videoWidth || !videoHeight) return;

      // Karenin ortasındaki kare bölge (ekrandaki hedef çerçeveyi kapsar)
      const side = Math.min(videoWidth, videoHeight);
      const size = Math.min(side, MAX_DECODE_SIZE);
      if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
      }
      context.drawImage(
        video,
        (videoWidth - side) / 2,
        (videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
      );

      const { buffer } = context.getImageData(0, 0, size, size).data;
      const request: DecodeRequest = { width: size, height: size, buffer };
      workerBusy = true;
      worker.postMessage(request, [buffer]);
    };
    const scanTimer = setInterval(scanFrame, SCAN_INTERVAL_MS);

    const stop = () => {
      generation++;
      stopStream(stream);
      stream = null;
      video.srcObject = null;
    };

    const start = async () => {
      const current = ++generation;
      try {
        const opened = await openBackCamera();
        if (disposed || current !== generation) {
          stopStream(opened);
          return;
        }
        stream = opened;
        video.srcObject = opened;
        await video.play().catch(() => {
          // autoplay + muted + playsInline zaten oynatmayı başlatır
        });
        if (disposed || current !== generation) return;
        setCameraError(null);
        setCameraReady(true);
      } catch (err) {
        if (disposed || current !== generation) return;
        console.error("Kamera açılamadı:", err);
        setCameraReady(false);
        setCameraError(err instanceof CameraError ? err.kind : "unknown");
      }
    };

    // iOS PWA arka plana alındığında kamera akışını dondurur ve geri
    // dönüldüğünde siyah ekran kalır; görünürlük değişiminde akış yenilenir.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void start();
      } else {
        stop();
        setCameraReady(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (document.visibilityState === "visible") void start();

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(scanTimer);
      stop();
      worker.terminate();
    };
  }, [attempt]);

  const errorText = cameraError ? CAMERA_ERROR_TEXT[cameraError] : null;

  return (
    <div className="scanner-page-root">
      {/* Kamera Görüntüsü */}
      <video
        ref={videoRef}
        className="camera-feed"
        autoPlay
        muted
        playsInline
        disablePictureInPicture
      />

      {errorText ? (
        <div className="scanner-center-view">
          <CameraOff size={48} color="#ef4444" />
          <h2 className="perm-title">{errorText.title}</h2>
          <p className="perm-desc">{errorText.desc}</p>
          <button
            className="perm-btn"
            onClick={() => {
              setCameraError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Yeniden Dene
          </button>
          <button className="back-link-btn" onClick={() => router.push("/")}>
            Ana Sayfaya Dön
          </button>
        </div>
      ) : (
        <>
          {/* Üst Geri Butonu */}
          <button className="top-back-button" onClick={() => router.push("/")}>
            <ArrowLeft size={22} color="#FFFFFF" />
          </button>

          {/* Arayüz Katmanı (Overlay) */}
          <div className="scanner-overlay">
            {/* Giriş / Çıkış Durum Rozeti */}
            <div
              className={`status-banner ${
                scanType === "IN" ? "banner-in" : "banner-out"
              }`}
            >
              <span className="banner-dot" />
              <span className="banner-text">
                {scanType === "IN" ? "GİRİŞ İŞLEMİ" : "ÇIKIŞ İŞLEMİ"}
              </span>
            </div>

            {/* Tarama Hedef Çerçevesi */}
            <div className="target-frame">
              {(loading || !cameraReady) && (
                <div className="loading-card">
                  <Loader2 size={36} color="#00E676" className="spin" />
                  <span className="loading-label">
                    {loading ? "Doğrulanıyor..." : "Kamera açılıyor..."}
                  </span>
                </div>
              )}
            </div>

            {/* Bilgi Metni */}
            <div className="hint-pill">
              {loading
                ? "Giriş doğrulanıyor..."
                : "Karekodu çerçeveye hizalayın, telefonu 20-30 cm uzakta tutun"}
            </div>
          </div>
        </>
      )}

      {/* Doğrulama Sonuç Modal'ı */}
      {resultModal.open && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3
              className={`modal-title ${
                resultModal.success ? "success-text" : "danger-text"
              }`}
            >
              {resultModal.title}
            </h3>
            <p className="modal-message">{resultModal.message}</p>
            <div className="modal-actions">
              {resultModal.success ? (
                <button
                  className="modal-btn confirm"
                  onClick={() => {
                    resetScanner();
                    router.push("/");
                  }}
                >
                  Tamam
                </button>
              ) : (
                <button className="modal-btn retry" onClick={resetScanner}>
                  Tekrar Dene
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
