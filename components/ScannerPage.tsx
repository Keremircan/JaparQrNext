"use client";

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  ArrowLeft,
  CameraOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";
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
import { apiPost, isDeviceFailure, requiresRelogin } from "../lib/api";
import { formatTime } from "../lib/datetime";
import { vibrate } from "../lib/ui";
import { timingLabel, type Timing } from "./TimingBadge";
import "../styles/ScannerPage.css";

// Analiz için kareden kesilen orta bölgenin azami kenarı (px). Kamera
// çözünürlüğü bunun altındaysa ölçekleme yapılmaz, pikseller olduğu gibi gider.
const MAX_DECODE_SIZE = 1080;
const SCAN_INTERVAL_MS = 70;
// Başarısız denemeden sonra aynı karenin hemen yeniden okunmaması için bekleme
const RETRY_UNLOCK_MS = 1200;

type ScannerErrorKind = CameraErrorKind | "decoder";

const SCANNER_ERROR_TEXT: Record<
  ScannerErrorKind,
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
  decoder: {
    title: "Karekod Okuyucu Yüklenemedi",
    desc: "Okuyucu bileşeni indirilemedi. İnternet bağlantınızı kontrol edip yeniden deneyin.",
  },
};

type VerifyResponse = {
  type: "IN" | "OUT";
  message: string;
  gate: string;
  createdAt: string;
  timing: Timing | null;
};

type ScanResult =
  | {
      success: true;
      type: "IN" | "OUT";
      gate: string;
      time: string;
      timing: Timing | null;
    }
  | { success: false; title: string; message: string; relogin: boolean };

export default function ScannerPage() {
  const { employee, setLastType, signOut } = useSession();
  const router = useRouter();

  const [scannerError, setScannerError] = useState<ScannerErrorKind | null>(
    null,
  );
  const [cameraReady, setCameraReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const isScanningLocked = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ekrandaki ön bilgi; kaydedilen işlem türünü sunucu belirler
  const expectedType: "IN" | "OUT" = employee?.lastType === "IN" ? "OUT" : "IN";
  const employeeCode = employee?.employeeCode;

  // Sayfadan her çıkışta tarama durumu sıfırlanır.
  //
  // cacheComponents açıkken Next.js sayfadan ayrılınca bileşeni kaldırmaz,
  // <Activity> ile gizler: effect'ler temizlenir ama useState/useRef değerleri
  // KORUNUR. Sıfırlanmazsa /scan'e dönüldüğünde kamera yerine bir önceki
  // sonuç ekranı görünür ve tarama kilidi açık kalır. useLayoutEffect, sıfırlamanın
  // sayfa gizlenmeden önce uygulanmasını sağlar (dönüşte eski ekran parlamaz).
  useLayoutEffect(() => {
    return () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
      isScanningLocked.current = false;
      setResult(null);
      setLoading(false);
      setScannerError(null);
      setCameraReady(false);
    };
  }, []);

  const retryScan = () => {
    setResult(null);
    // Aynı karenin hemen yeniden okunmaması için kilit kısa bir süre sonra açılır
    if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    unlockTimerRef.current = setTimeout(() => {
      isScanningLocked.current = false;
    }, RETRY_UNLOCK_MS);
  };

  // Ana sayfaya dönüş: kamera ve kalan durum, sayfa gizlenirken çalışan
  // temizleme fonksiyonlarında (yukarıdaki ve kamera effect'indeki) kapatılır.
  const goHome = () => {
    setResult(null);
    router.replace("/");
  };

  const handleBarcodeScanned = useCallback(
    async (decodedText: string) => {
      if (isScanningLocked.current || !employeeCode) return;

      isScanningLocked.current = true;
      setLoading(true);
      vibrate(40);

      const response = await apiPost<VerifyResponse>("/api/verify", {
        qrData: decodedText,
        employeeCode,
      });
      setLoading(false);

      if (response.ok) {
        const { type, gate, createdAt, timing } = response.data;
        vibrate([40, 60, 40]);
        setLastType(type);
        // Otomatik yönlendirme yok: sonuç, personel "Tamam"a basana kadar kalır
        setResult({
          success: true,
          type,
          gate,
          time: formatTime(createdAt),
          timing: timing ?? null,
        });
        return;
      }

      vibrate([60, 60, 60]);
      setResult({
        success: false,
        title:
          response.status === 0
            ? "Bağlantı Hatası"
            : isDeviceFailure(response)
              ? "Yetkisiz Cihaz"
              : "İşlem Reddedildi",
        message: response.message,
        relogin: requiresRelogin(response),
      });
    },
    [employeeCode, setLastType],
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
    const onDecoderFailure = (detail: unknown) => {
      console.error("QR çözücü çalışmıyor:", detail);
      if (!disposed) setScannerError("decoder");
    };
    worker.onerror = (event) => onDecoderFailure(event.message);
    worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
      const message = event.data;
      if (message.type === "fatal") {
        onDecoderFailure(message.message);
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

        // Akış dışarıdan kesilirse (başka uygulama kamerayı aldı, sistem
        // kesintisi vb.) donmuş kare kalmasın diye kamera yeniden açılır.
        opened.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (disposed || stream !== opened) return;
          setCameraReady(false);
          void start();
        });

        await video.play().catch(() => {
          // autoplay + muted + playsInline zaten oynatmayı başlatır
        });
        if (disposed || current !== generation) return;
        setScannerError((kind) => (kind === "decoder" ? kind : null));
        setCameraReady(true);
      } catch (err) {
        if (disposed || current !== generation) return;
        console.error("Kamera açılamadı:", err);
        setCameraReady(false);
        setScannerError(err instanceof CameraError ? err.kind : "unknown");
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

  const errorText = scannerError ? SCANNER_ERROR_TEXT[scannerError] : null;

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
        <div className="scanner-center-view" role="alert">
          <CameraOff size={56} color="#f87171" />
          <h2 className="perm-title">{errorText.title}</h2>
          <p className="perm-desc">{errorText.desc}</p>
          <button
            type="button"
            className="scanner-btn scanner-btn-primary"
            onClick={() => {
              setScannerError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Yeniden Dene
          </button>
          <button
            type="button"
            className="scanner-btn scanner-btn-ghost"
            onClick={goHome}
          >
            Ana Sayfaya Dön
          </button>
        </div>
      ) : (
        <>
          {/* Üst Geri Butonu */}
          <button
            type="button"
            className="top-back-button"
            aria-label="Ana sayfaya dön"
            onClick={goHome}
          >
            <ArrowLeft size={24} color="#FFFFFF" />
          </button>

          {/* Arayüz Katmanı (Overlay) */}
          <div className="scanner-overlay">
            {/* Giriş / Çıkış Durum Rozeti */}
            <div
              className={`status-banner ${
                expectedType === "IN" ? "banner-in" : "banner-out"
              }`}
            >
              <span className="banner-dot" />
              <span className="banner-text">
                {expectedType === "IN" ? "GİRİŞ İŞLEMİ" : "ÇIKIŞ İŞLEMİ"}
              </span>
            </div>

            {/* Tarama Hedef Çerçevesi */}
            <div className="target-frame">
              <span className="frame-corner corner-tl" />
              <span className="frame-corner corner-tr" />
              <span className="frame-corner corner-bl" />
              <span className="frame-corner corner-br" />
              {(loading || !cameraReady) && (
                <div className="loading-card">
                  <Loader2 size={40} color="#22c55e" className="spin" />
                  <span className="loading-label">
                    {loading ? "Doğrulanıyor..." : "Kamera açılıyor..."}
                  </span>
                </div>
              )}
            </div>

            {/* Bilgi Metni */}
            <div className="hint-pill">
              {loading
                ? "Lütfen bekleyin..."
                : "Karekodu çerçevenin içine getirin, telefonu 20-30 cm uzakta tutun"}
            </div>
          </div>
        </>
      )}

      {/* Tam Ekran Sonuç */}
      {result?.success && (
        <div className="result-screen result-success" role="status">
          <CheckCircle2 size={112} strokeWidth={1.75} />
          <h2 className="result-title">
            {result.type === "IN" ? "GİRİŞ YAPILDI" : "ÇIKIŞ YAPILDI"}
          </h2>
          <p className="result-time">{result.time}</p>
          <p className="result-message">Kapı: {result.gate}</p>
          {result.timing && result.timing.status !== "on_time" && (
            <p className="result-timing">{timingLabel(result.timing)}</p>
          )}
          <button
            type="button"
            className="scanner-btn result-btn"
            onClick={goHome}
          >
            Tamam
          </button>
        </div>
      )}

      {result && !result.success && (
        <div className="result-screen result-failure" role="alert">
          <XCircle size={112} strokeWidth={1.75} />
          <h2 className="result-title">{result.title}</h2>
          <p className="result-message">{result.message}</p>
          {result.relogin ? (
            <button
              type="button"
              className="scanner-btn result-btn"
              onClick={() => {
                signOut();
                router.replace("/login");
              }}
            >
              Yeniden Giriş Yap
            </button>
          ) : (
            <>
              <button
                type="button"
                className="scanner-btn result-btn"
                onClick={retryScan}
              >
                Tekrar Dene
              </button>
              <button
                type="button"
                className="scanner-btn scanner-btn-ghost"
                onClick={goHome}
              >
                Ana Sayfaya Dön
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
