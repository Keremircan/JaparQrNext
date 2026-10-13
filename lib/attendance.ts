// Giriş/çıkış sırasının tek doğruluk kaynağı. Hem /api/verify (kayıt) hem
// /api/listLogs (gösterim) aynı kuralı kullanır.

import type { QueryResultRow } from 'pg';
import { SQL_TODAY_START } from './datetime';

export type LogType = 'IN' | 'OUT';

// Bir vardiyanın sürebileceği azami süre. Son hareket bu süreden eskiyse
// (ör. çıkış okutmayı unutan personel) yok sayılır ve yeni okutma GİRİŞ olur.
// Takvim günü yerine süre kullanıldığı için gece vardiyası (23:00 - 07:00)
// gece yarısında bölünmez.
export const MAX_SHIFT_HOURS = 16;

// Aynı personelin art arda okutmaları arasındaki asgari süre. Yanlışlıkla çift
// okutmayı ve aynı karekodun yeniden kullanılmasını (replay) engeller; karekod
// en fazla ~30 sn geçerli olduğundan bu süre onu tamamen kapsar.
export const RESCAN_COOLDOWN_SECONDS = 60;

type Queryable = {
  query: <R extends QueryResultRow>(
    text: string,
    values?: unknown[]
  ) => Promise<{ rows: R[] }>;
};

type LastLogRow = {
  log_type: LogType;
  created_at: Date;
  age_seconds: string;
};

export type LastLog = {
  type: LogType;
  createdAt: Date;
  ageSeconds: number;
};

/** Personelin vardiya penceresi içindeki son hareketi (yoksa null). */
export async function getLastLog(
  db: Queryable,
  employeeCode: string
): Promise<LastLog | null> {
  const result = await db.query<LastLogRow>(
    `SELECT log_type, created_at,
            EXTRACT(EPOCH FROM (now() - created_at)) AS age_seconds
       FROM attendance_logs
      WHERE employee_code = $1
        AND created_at >= now() - make_interval(hours => $2::int)
      ORDER BY created_at DESC
      LIMIT 1`,
    [employeeCode, MAX_SHIFT_HOURS]
  );

  const row = result.rows[0];
  if (!row) return null;
  return {
    type: row.log_type,
    createdAt: row.created_at,
    ageSeconds: Number(row.age_seconds),
  };
}

/** Son harekete göre sıradaki işlem: içerideyse ÇIKIŞ, değilse GİRİŞ. */
export function nextLogType(last: LastLog | null): LogType {
  return last?.type === 'IN' ? 'OUT' : 'IN';
}

type LogRow = {
  id: string;
  gate_id: string | null;
  log_type: LogType;
  created_at: Date;
};

export type AttendanceLogDto = {
  id: number;
  gate: string;
  type: LogType;
  createdAt: string; // UTC ISO
};

const toDto = (row: LogRow): AttendanceLogDto => ({
  id: Number(row.id),
  gate: row.gate_id ?? '',
  type: row.log_type,
  createdAt: row.created_at.toISOString(),
});

/**
 * Ana sayfada gösterilecek hareketler (yeniden eskiye): bugünün (Türkiye saati)
 * kayıtları ve, vardiya gece yarısından önce başladıysa, o vardiyanın girişi.
 */
export async function getTodayLogs(
  db: Queryable,
  employeeCode: string
): Promise<AttendanceLogDto[]> {
  const today = await db.query<LogRow>(
    `SELECT id, gate_id, log_type, created_at
       FROM attendance_logs
      WHERE employee_code = $1 AND created_at >= ${SQL_TODAY_START}
      ORDER BY created_at DESC`,
    [employeeCode]
  );

  // Gece yarısını içeride geçiren personelin dünkü girişi
  const carried = await db.query<LogRow>(
    `SELECT id, gate_id, log_type, created_at
       FROM attendance_logs
      WHERE employee_code = $1
        AND created_at < ${SQL_TODAY_START}
        AND created_at >= now() - make_interval(hours => $2::int)
      ORDER BY created_at DESC
      LIMIT 1`,
    [employeeCode, MAX_SHIFT_HOURS]
  );

  const logs = today.rows.map(toDto);
  const previous = carried.rows[0];
  if (previous?.log_type === 'IN') logs.push(toDto(previous));
  return logs;
}
