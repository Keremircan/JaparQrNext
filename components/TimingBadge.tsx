// Hareket listesindeki vardiya durumu etiketi (zamanında / geç / erken)

import type { ShiftTiming, TimingStatus } from '../lib/shiftTiming';

export type Timing = Pick<ShiftTiming, 'status' | 'minutes'>;

/** 75 -> "1 sa 15 dk", 45 -> "45 dk" */
export function formatMinutes(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} dk`;
  return minutes === 0 ? `${hours} sa` : `${hours} sa ${minutes} dk`;
}

export function timingLabel(timing: Timing): string {
  switch (timing.status) {
    case 'late':
      return `${formatMinutes(timing.minutes)} geç girildi`;
    case 'early_leave':
      return `${formatMinutes(timing.minutes)} erken çıkıldı`;
    case 'early_arrival':
      return `${formatMinutes(timing.minutes)} önce gelindi`;
    default:
      return 'Zamanında';
  }
}

const STYLES: Record<TimingStatus, string> = {
  // İhlaller: kırmızı ve dikkat çekici
  late: 'bg-red-50 text-red-700 ring-red-200',
  early_leave: 'bg-red-50 text-red-700 ring-red-200',
  // Bilgilendirici
  early_arrival: 'bg-slate-100 text-slate-600 ring-slate-200',
  on_time: 'bg-green-50 text-green-700 ring-green-200',
};

const DOTS: Record<TimingStatus, string> = {
  late: 'bg-red-600',
  early_leave: 'bg-red-600',
  early_arrival: 'bg-slate-400',
  on_time: 'bg-green-600',
};

export default function TimingBadge({ timing }: { timing: Timing | null | undefined }) {
  // Vardiyası tanımsız personel veya vardiya dışı hareket: etiket yok
  if (!timing) return null;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] leading-none font-semibold whitespace-nowrap ring-1 ring-inset ${STYLES[timing.status]}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOTS[timing.status]}`} />
      {timingLabel(timing)}
    </span>
  );
}
