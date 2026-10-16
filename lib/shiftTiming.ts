// Vardiya saat kuralları: giriş/çıkış anını personelin tanımlı vardiyasıyla
// karşılaştırır. Hem kayıt (/api/verify) hem gösterim (/api/listLogs) bu
// dosyayı kullanır; böylece ekrandaki etiket ile veritabanındaki ihlal aynı
// hesaptan çıkar.

import type { AttendanceLogDto } from './attendance';

const APP_TIME_ZONE = 'Europe/Istanbul';
const MINUTE_MS = 60_000;

function readToleranceMinutes(): number {
  const value = Number(process.env.SHIFT_TOLERANCE_MINUTES);
  return Number.isInteger(value) && value >= 0 && value <= 60 ? value : 3;
}

/** Bu süreye kadar geç gelme / erken çıkma ihlal sayılmaz (dakika). */
export const TOLERANCE_MINUTES = readToleranceMinutes();

// Vardiya başlamadan en fazla bu kadar önce yapılan hareket o vardiyaya
// sayılır. Daha önceki veya vardiya bitişinden sonraki girişler (ör. 08:00
// vardiyalı personelin 20:00'de gelmesi) vardiya dışıdır ve değerlendirilmez.
export const SHIFT_MATCH_WINDOW_MINUTES = 4 * 60;

export type TimingStatus = 'on_time' | 'late' | 'early_arrival' | 'early_leave';

export type ShiftTiming = {
  status: TimingStatus;
  /** Sapma süresi (dakika); zamanında ise 0 */
  minutes: number;
  /** Vardiyanın başladığı gün, Türkiye saatiyle "YYYY-AA-GG" */
  shiftDate: string;
};

type ShiftWindow = { startMinutes: number; durationMinutes: number };

/** "08:00 - 18:00", "23:00–07:00", "8.30 - 17.30" → dakika cinsinden pencere */
export function parseShift(text: string | null | undefined): ShiftWindow | null {
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})\s*$/.exec(text ?? '');
  if (!match) return null;

  const [startH, startM, endH, endM] = match.slice(1).map(Number);
  if (startH > 23 || endH > 23 || startM > 59 || endM > 59) return null;

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  // Bitiş başlangıçtan önceyse vardiya gece yarısını aşar (23:00 - 07:00)
  const durationMinutes = (endMinutes - startMinutes + 24 * 60) % (24 * 60);
  if (durationMinutes === 0) return null;

  return { startMinutes, durationMinutes };
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Anın Türkiye saatindeki takvim günü ve UTC farkı */
function istanbulDay(date: Date) {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  // Yerel saat - UTC (dakika). Türkiye 2016'dan beri sabit UTC+3, yine de hesaplanır.
  const localAsUtc = Date.UTC(year, month - 1, day, Number(parts.hour), Number(parts.minute));
  const offsetMinutes = Math.round((localAsUtc - date.getTime()) / MINUTE_MS);
  return { year, month, day, offsetMinutes };
}

function formatDay(date: Date): string {
  const { year, month, day } = istanbulDay(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Anı kapsayan vardiyanın başlangıcı: [başlangıç - pencere, bitiş] aralığına
 * düşen dün / bugün / yarın vardiyalarından başlangıca en yakını. Yoksa null.
 */
function shiftStartContaining(at: Date, shift: ShiftWindow): Date | null {
  const { year, month, day, offsetMinutes } = istanbulDay(at);
  const t = at.getTime();
  let best: Date | null = null;

  for (const dayOffset of [-1, 0, 1]) {
    const start = Date.UTC(year, month - 1, day + dayOffset) +
      (shift.startMinutes - offsetMinutes) * MINUTE_MS;
    const opens = start - SHIFT_MATCH_WINDOW_MINUTES * MINUTE_MS;
    const ends = start + shift.durationMinutes * MINUTE_MS;
    if (t < opens || t > ends) continue;
    if (!best || Math.abs(t - start) < Math.abs(t - best.getTime())) {
      best = new Date(start);
    }
  }
  return best;
}

export type PreviousLog = { type: 'IN' | 'OUT'; createdAt: Date } | null | undefined;

/**
 * Mola dönüşü mü? Aynı vardiya içinde bir çıkıştan sonra yapılan giriş, geç
 * gelme değil moladan dönüştür; o çıkış da erken çıkış sayılmamalıdır.
 */
export function isBreakReturn(
  at: Date,
  shiftText: string | null | undefined,
  previous: PreviousLog
): boolean {
  const shift = parseShift(shiftText);
  if (!shift || previous?.type !== 'OUT') return false;
  const start = shiftStartContaining(at, shift);
  const previousStart = shiftStartContaining(previous.createdAt, shift);
  return Boolean(start && previousStart && start.getTime() === previousStart.getTime());
}

const wholeMinutes = (ms: number) => Math.floor(ms / MINUTE_MS);

/**
 * Giriş: vardiya başlangıcına göre geç / erken / zamanında. Mola dönüşü veya
 * vardiya dışı giriş değerlendirilmez (null).
 */
export function evaluateCheckIn(
  at: Date,
  shiftText: string | null | undefined,
  previous?: PreviousLog
): ShiftTiming | null {
  const shift = parseShift(shiftText);
  if (!shift || isBreakReturn(at, shiftText, previous)) return null;
  const start = shiftStartContaining(at, shift);
  if (!start) return null;

  const shiftDate = formatDay(start);
  const lateBy = wholeMinutes(at.getTime() - start.getTime());
  const earlyBy = wholeMinutes(start.getTime() - at.getTime());

  if (lateBy > TOLERANCE_MINUTES) return { status: 'late', minutes: lateBy, shiftDate };
  if (earlyBy > TOLERANCE_MINUTES) return { status: 'early_arrival', minutes: earlyBy, shiftDate };
  return { status: 'on_time', minutes: 0, shiftDate };
}

/**
 * Çıkış: vardiya bitişine göre erken / zamanında. Vardiya, kapatılan girişin
 * ait olduğu vardiyadır; giriş bilinmiyorsa çıkışı kapsayan vardiya alınır.
 * Mola için yapılan çıkış da şimdilik erken çıkış sayılır; personel aynı
 * vardiyada geri dönünce bu kayıt iptal edilir (bkz. isBreakReturn).
 */
export function evaluateCheckOut(
  at: Date,
  shiftText: string | null | undefined,
  checkInAt: Date | null
): ShiftTiming | null {
  const shift = parseShift(shiftText);
  if (!shift) return null;

  const durationMs = shift.durationMinutes * MINUTE_MS;
  const start = shiftStartContaining(checkInAt ?? at, shift);
  if (!start) return null;

  const end = start.getTime() + durationMs;
  const earlyBy = wholeMinutes(end - at.getTime());
  const shiftDate = formatDay(start);

  return earlyBy > TOLERANCE_MINUTES
    ? { status: 'early_leave', minutes: earlyBy, shiftDate }
    : { status: 'on_time', minutes: 0, shiftDate };
}

/** Kaydedilmesi gereken ihlal türü (geç giriş / erken çıkış), değilse null */
export function violationReason(timing: ShiftTiming | null): 'geç geldi' | 'erken çıktı' | null {
  if (timing?.status === 'late') return 'geç geldi';
  if (timing?.status === 'early_leave') return 'erken çıktı';
  return null;
}

export type TimedAttendanceLog = AttendanceLogDto & {
  timing: Pick<ShiftTiming, 'status' | 'minutes'> | null;
};

/**
 * Hareket listesine vardiya etiketlerini ekler. Liste yeniden eskiye sıralıdır;
 * çıkışlar kendilerinden önceki girişle eşleştirilir. Mola (aynı vardiyada
 * çıkıp geri dönme) etiketlenmez.
 */
export function annotateLogs(
  logs: AttendanceLogDto[],
  shiftText: string | null | undefined
): TimedAttendanceLog[] {
  const timings = new Map<number, TimedAttendanceLog['timing']>();
  let previous: { id: number; type: 'IN' | 'OUT'; createdAt: Date } | null = null;
  let lastCheckIn: Date | null = null;

  for (const log of [...logs].reverse()) {
    const at = new Date(log.createdAt);
    let timing: ShiftTiming | null;

    if (log.type === 'IN') {
      if (previous && isBreakReturn(at, shiftText, previous)) {
        timings.set(previous.id, null); // moladan dönüldü: çıkış erken çıkış değil
      }
      timing = evaluateCheckIn(at, shiftText, previous);
      lastCheckIn = at;
    } else {
      timing = evaluateCheckOut(at, shiftText, lastCheckIn);
    }

    timings.set(log.id, timing ? { status: timing.status, minutes: timing.minutes } : null);
    previous = { id: log.id, type: log.type, createdAt: at };
  }

  return logs.map((log) => ({ ...log, timing: timings.get(log.id) ?? null }));
}
