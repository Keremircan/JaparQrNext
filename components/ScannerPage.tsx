"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2, ArrowLeft, CameraOff } from "lucide-react";
import { useSession } from "../context/useSession";
import "../styles/ScannerPage.css";

const QR_REGION_ID = "pwa-qr-reader-region";

export default function ScannerPage() {
  const { employee, setLastType } = useSession();
  const router = useRouter();

  const [permissionDenied, setPermissionDenied] = useState(false);
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
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // IN / OUT tespiti
  const scanType: "IN" | "OUT" = employee?.lastType === "IN" ? "OUT" : "IN";
  const employeeId = employee?.employeeCode ?? "EMP-00000";

  // Web tarayıcısında kalıcı hardwareId alma veya üretme
  const getHardwareId = (): string => {
    if (typeof window === "undefined") return "DEV-SERVER";
    let id = localStorage.getItem("device_hardware_id");
    if (!id) {
      id =
        "DEV-" +
        Math.random().toString(36).substring(2, 12) +
        "-" +
        Date.now().toString(36);
      localStorage.setItem("device_hardware_id", id);
    }
    return id;
  };

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
      if (isScanningLocked.current || loading) return;

      isScanningLocked.current = true;
      setLoading(true);
      triggerVibrate(40);

      const hardwareId = getHardwareId();

      try {
        const response = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qrData: decodedText,
            employeeId,
            hardwareId,
            type: scanType,
          }),
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
            title: "İşlem Reddedildi",
            message: result.message || "Kod doğrulanamadı.",
          });
        }
      } catch {
        triggerVibrate([60, 60, 60]);
        setResultModal({
          open: true,
          success: false,
          title: "Bağlantı Hatası",
          message: "Sunucuya erişilemedi. Wi-Fi bağlantınızı kontrol edin.",
        });
      } finally {
        setLoading(false);
      }
    },
    [employeeId, loading, scanType, setLastType],
  );

  // Kamerayı başlatma ve temizleme
  useEffect(() => {
    const html5QrCode = new Html5Qrcode(QR_REGION_ID);
    scannerRef.current = html5QrCode;

    // Ekran boyutuna göre dinamik net tarama alanı
    const scanConfig = {
      fps: 15,
      disableFlip: true,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true, // Varsa iOS/Android donanımsal barkod motorunu açar (milisaniyede okur)
      },
    };

    html5QrCode
      .start(
        { facingMode: "environment" },
        scanConfig,
        (decodedText) => {
          console.log("KAREKOD BAŞARIYLA OKUNDU:", decodedText);
          void handleBarcodeScanned(decodedText);
        },
        () => {
          // Boş kareleri sessiz geç
        },
      )
      .catch((err) => {
        console.error("Kamera açılamadı:", err);
        setPermissionDenied(true);
      });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch((e) => console.error("Kamera durdurulamadı:", e));
      }
    };
  }, [handleBarcodeScanned]);

  if (permissionDenied) {
    return (
      <div className="scanner-center-view">
        <CameraOff size={48} color="#ef4444" />
        <h2 className="perm-title">Kamera İzni Gerekli</h2>
        <p className="perm-desc">
          Giriş/çıkış doğrulaması yapabilmek için tarayıcınızın kamera iznini
          onaylamanız gerekmektedir.
        </p>
        <button className="perm-btn" onClick={() => window.location.reload()}>
          Yeniden Dene
        </button>
        <button className="back-link-btn" onClick={() => router.push("/")}>
          Ana Sayfaya Dön
        </button>
      </div>
    );
  }

  return (
    <div className="scanner-page-root">
      {/* Üst Geri Butonu */}
      <button className="top-back-button" onClick={() => router.push("/")}>
        <ArrowLeft size={22} color="#FFFFFF" />
      </button>

      {/* Kamera Akış Konteyneri */}
      <div id={QR_REGION_ID} className="camera-feed" />

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
          {loading && (
            <div className="loading-card">
              <Loader2 size={36} color="#00E676" className="spin" />
              <span className="loading-label">Doğrulanıyor...</span>
            </div>
          )}
        </div>

        {/* Bilgi Metni */}
        <div className="hint-pill">
          {loading
            ? "Giriş doğrulanıyor..."
            : "Karekodu ekrandaki çerçevenin içine hizalayın"}
        </div>
      </div>

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
