export type CameraErrorKind =
  | "insecure" // HTTPS değil veya tarayıcı getUserMedia desteklemiyor
  | "denied" // Kullanıcı / sistem izni reddetti
  | "notfound" // Cihazda kamera yok
  | "busy" // Kamera başka bir uygulama tarafından kullanılıyor
  | "unknown";

export class CameraError extends Error {
  kind: CameraErrorKind;

  constructor(kind: CameraErrorKind, cause?: unknown) {
    super(`Camera error: ${kind}`);
    this.kind = kind;
    this.cause = cause;
  }
}

const DEVICE_CACHE_KEY = "scanner_camera_device_id";

// Yalnızca "ideal" kullanılır: min/exact çözünürlük kısıtları iOS Safari'de
// OverconstrainedError veya siyah ekrana yol açıyor. Tarayıcı 1080p veremezse
// kendiliğinden en yakın çözünürlüğe düşer.
const VIDEO_QUALITY: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
  frameRate: { ideal: 30 },
};

// Ana (1x) lens dışındaki arka kameraları ayırt eden etiket parçaları.
// iOS etiketleri cihaz diline göre çevrilir ("Back Ultra Wide Camera" /
// "Arka Ultra Geniş Kamera"), bu yüzden hem İngilizce hem Türkçe aranır.
// "dual/triple" sanal kameraları da elenir: yakına gelince kendiliğinden
// ultra geniş (makro) lense geçip görüntüyü bulanıklaştıran onlar.
const NON_MAIN_LENS =
  /ultra|wide|geni[sş]|tele|dual|triple|[cç]ift|ikili|[uü][cç]l[uü]|macro|makro|depth|derinlik|lidar|infrared|0[.,]5/i;
const BACK_LABEL = /back|rear|arka|environment/i;
const FRONT_LABEL = /front|[oö]n\b|user|face|selfie/i;

function toCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return new CameraError("denied", err);
  if (name === "NotFoundError") return new CameraError("notfound", err);
  if (name === "NotReadableError" || name === "AbortError")
    return new CameraError("busy", err);
  return new CameraError("unknown", err);
}

function isBackCamera(device: MediaDeviceInfo): boolean {
  // Chrome ve Safari 17+: etikete bakmadan yönü öğrenebiliyoruz
  const caps = (device as Partial<InputDeviceInfo>).getCapabilities?.();
  const facing = caps?.facingMode;
  if (facing && facing.length > 0) return facing.includes("environment");
  return BACK_LABEL.test(device.label) && !FRONT_LABEL.test(device.label);
}

/**
 * Arka kameralar arasından ana (1x, otomatik odaklı) lensi seçer.
 * Sıralama: özel lens anahtar kelimesi içermeyen > Android'de en küçük
 * camera2 indeksi (0 = ana kamera) > en kısa etiket (iOS'ta düz
 * "Back Camera" her dilde en kısa olandır).
 */
export function pickMainBackCamera(
  devices: MediaDeviceInfo[],
): MediaDeviceInfo | null {
  const back = devices.filter(
    (d) => d.kind === "videoinput" && d.label && isBackCamera(d),
  );
  if (back.length === 0) return null;

  const rank = (d: MediaDeviceInfo) => {
    const index = /camera2?\s+(\d+)/i.exec(d.label);
    return [
      NON_MAIN_LENS.test(d.label) ? 1 : 0,
      index ? Number(index[1]) : 0,
      d.label.length,
    ];
  };

  return back.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
  })[0];
}

// Android Chrome sürekli otomatik odağı constraint olarak açmaya izin verir.
// iOS Safari focusMode sunmaz; orada ana lens zaten sürekli odaklar.
async function enableContinuousFocus(stream: MediaStream) {
  const track = stream.getVideoTracks()[0];
  const caps = track?.getCapabilities?.() as
    | (MediaTrackCapabilities & { focusMode?: string[] })
    | undefined;
  if (!caps?.focusMode?.includes("continuous")) return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    });
  } catch {
    // Desteklenmiyorsa varsayılan odak davranışıyla devam
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function readCachedDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_CACHE_KEY);
  } catch {
    return null;
  }
}

function writeCachedDeviceId(id: string | null) {
  try {
    if (id) localStorage.setItem(DEVICE_CACHE_KEY, id);
    else localStorage.removeItem(DEVICE_CACHE_KEY);
  } catch {
    // Özel sekme vb. — önbelleksiz devam
  }
}

/**
 * Ana arka kamerayı açar.
 *
 * 1. Önceki oturumda seçilen kamera biliniyorsa doğrudan o açılır.
 * 2. Aksi halde facingMode ile herhangi bir arka kamera açılır (izin
 *    verilmeden cihaz etiketleri okunamaz), ardından cihaz listesinden ana
 *    lens bulunur ve açılan kamera o değilse akış ana lensle yeniden açılır.
 */
export async function openBackCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError("insecure");

  const cachedId = readCachedDeviceId();
  if (cachedId) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...VIDEO_QUALITY, deviceId: { exact: cachedId } },
      });
      await enableContinuousFocus(stream);
      return stream;
    } catch (err) {
      const error = toCameraError(err);
      if (error.kind === "denied") throw error;
      // deviceId geçersizleşmiş olabilir; normal akışa dön
      writeCachedDeviceId(null);
    }
  }

  const openDefault = () =>
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { ...VIDEO_QUALITY, facingMode: { ideal: "environment" } },
    });

  let stream: MediaStream;
  try {
    stream = await openDefault();
  } catch (err) {
    throw toCameraError(err);
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const main = pickMainBackCamera(devices);
    const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId;

    if (main && main.deviceId && main.deviceId !== currentId) {
      // iOS aynı anda iki arka kamerayı açamaz; önce mevcut akış kapatılır
      stopStream(stream);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...VIDEO_QUALITY, deviceId: { exact: main.deviceId } },
        });
      } catch {
        stream = await openDefault();
      }
    }
    if (main?.deviceId) writeCachedDeviceId(main.deviceId);
  } catch (err) {
    if (!stream.active) throw toCameraError(err);
    // Cihaz listesi alınamadıysa facingMode ile açılan kamerayla devam
  }

  await enableContinuousFocus(stream);
  return stream;
}
