// employees.device_label kolonunda cihazın User-Agent metni saklanır.
// Personele gösterirken okunabilir bir cihaz adına çevrilir.

function detectBrowser(ua: string): string | null {
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/EdgA?\//i.test(ua) || /EdgiOS/i.test(ua)) return 'Edge';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return null;
}

function detectDevice(ua: string): string | null {
  // iOS model bilgisini (ör. "15 Pro Max") tarayıcıya vermez; yalnızca sürüm okunabilir
  const ios = /(iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/.exec(ua);
  if (ios) return `${ios[1]} (iOS ${ios[2]}.${ios[3]})`;
  if (/iPhone|iPad/.test(ua)) return /iPad/.test(ua) ? 'iPad' : 'iPhone';

  const android = /Android (\d+)[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\)/.exec(ua);
  if (android) {
    // Yeni Chrome sürümleri gizlilik için modeli "K" olarak maskeler
    const model = android[2].trim();
    return model && model !== 'K' && !/^wv$/i.test(model)
      ? `${model} (Android ${android[1]})`
      : `Android ${android[1]} telefon`;
  }
  if (/Android/.test(ua)) return 'Android telefon';

  if (/Windows/.test(ua)) return 'Windows bilgisayar';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac bilgisayar';
  if (/Linux/.test(ua)) return 'Linux bilgisayar';
  return null;
}

/** "iPhone (iOS 18.1) · Safari", "SM-S918B (Android 14) · Chrome" */
export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Bilinmeyen cihaz';
  const parts = [detectDevice(userAgent), detectBrowser(userAgent)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Bilinmeyen cihaz';
}
