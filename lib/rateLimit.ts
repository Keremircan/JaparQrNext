// Basit, bellek içi deneme sınırlayıcı (kayan pencere).
//
// Sınır: sayaçlar sunucu sürecinin belleğindedir. Birden fazla örnek çalışan
// ortamlarda (Vercel vb.) her örnek kendi sayacını tutar; bu yüzden kaba kuvvet
// denemelerini yavaşlatır ama kesin bir üst sınır koymaz. Kesin sınır için
// paylaşımlı bir depo (Upstash/Redis) veya platformun WAF kuralı gerekir.

const attempts = new Map<string, number[]>();
const MAX_KEYS = 10_000;

function recent(key: string, windowMs: number, now: number): number[] {
  const list = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length > 0) attempts.set(key, list);
  else attempts.delete(key);
  return list;
}

/** Anahtar için pencere içindeki deneme sayısı sınırı aştı mı? */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  return recent(key, windowMs, Date.now()).length >= limit;
}

/** Anahtar için bir (başarısız) deneme kaydeder. */
export function recordAttempt(key: string, windowMs: number) {
  const now = Date.now();
  const list = recent(key, windowMs, now);
  list.push(now);
  attempts.set(key, list);

  // Bellek sınırsız büyümesin: en eski anahtarları at
  if (attempts.size > MAX_KEYS) {
    const overflow = attempts.size - MAX_KEYS;
    let removed = 0;
    for (const oldKey of attempts.keys()) {
      attempts.delete(oldKey);
      if (++removed >= overflow) break;
    }
  }
}

export function clearAttempts(key: string) {
  attempts.delete(key);
}

/** İsteğin geldiği IP (vekil sunucu arkasında x-forwarded-for'un ilk değeri). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}
