// Tüm saat gösterimleri cihazın/sunucunun yerel ayarından bağımsız olarak
// Türkiye saatine ve 24 saatlik biçime sabitlenir.
export const APP_TIME_ZONE = 'Europe/Istanbul';

// Postgres tarafında "Türkiye saatine göre bugünün başlangıcı" (timestamptz).
// created_at::date = CURRENT_DATE veritabanı UTC çalıştığı için günü 03:00'te
// değiştiriyordu; ayrıca bu ifade created_at indeksini kullanabilir.
export const SQL_TODAY_START = `(date_trunc('day', now() AT TIME ZONE '${APP_TIME_ZONE}') AT TIME ZONE '${APP_TIME_ZONE}')`;

// hourCycle 'h23': AM/PM yok, gece yarısı "24:00" değil "00:00"
const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const longDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "17:15" */
export function formatTime(value: string | number | Date): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : '--:--';
}

/** "13.10.2026 17:15" */
export function formatDateTime(value: string | number | Date): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date).replace(',', '') : '--';
}

/** "13 Ekim Salı" */
export function formatLongDate(value: string | number | Date): string {
  const date = toDate(value);
  return date ? longDateFormatter.format(date) : '';
}
