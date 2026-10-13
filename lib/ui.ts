// Bileşenlerin ortak kullandığı küçük arayüz yardımcıları.

/** Dokunsal geri bildirim (destekleyen cihazlarda; iOS Safari desteklemez). */
export function vibrate(pattern: number | number[] = 30) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Tarayıcı izin vermiyorsa sessizce geç
  }
}

/** "Ayşe Yılmaz" -> "AY" (Türkçe büyük harf kuralıyla: i -> İ) */
export function getInitials(name: string | null | undefined, fallback = 'P'): string {
  const initials = (name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('tr-TR');
  return initials || fallback;
}

/** "Ayşe Test Yılmaz" -> "Ayşe" */
export function getFirstName(name: string | null | undefined, fallback = 'Çalışan'): string {
  return (name ?? '').trim().split(' ')[0] || fallback;
}
