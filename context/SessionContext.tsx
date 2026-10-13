'use client';

import {
  useCallback,
  useMemo,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';
import { SessionContext, type EmployeeSession } from './sessionTypes';

// Oturum localStorage'da tutulur. Bu yalnızca arayüz durumudur: sunucu her
// isteği cihaz imzasıyla ayrıca doğrular (bkz. lib/deviceBinding.ts).
const STORAGE_KEY = 'user_session';
const CHANGE_EVENT = 'japar-session-change';

// localStorage kullanılamıyorsa (gizli sekme vb.) oturum sekme ömrünce bellekte tutulur
let memoryFallback: { value: string | null } | null = null;

function readRaw(): string | null {
  if (memoryFallback) return memoryFallback.value;
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
    memoryFallback = null;
  } catch (error) {
    console.error('Oturum kaydedilemedi:', error);
    memoryFallback = { value };
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// "storage" olayı diğer sekmelerdeki değişikliği (ör. çıkış) bu sekmeye taşır
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const subscribeNever = () => () => {};

const textOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

// Saklanan veri bozuk veya eski biçimde olabilir; tipine güvenmeden doğrula
function parseSession(raw: string | null): EmployeeSession | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;

    const employeeCode = textOrNull(record.employeeCode);
    if (!employeeCode) return null;

    return {
      employeeCode,
      name: textOrNull(record.name) ?? 'Personel',
      department: textOrNull(record.department),
      job: textOrNull(record.job),
      shift: textOrNull(record.shift),
      shift_type: textOrNull(record.shift_type),
      lastType:
        record.lastType === 'IN' || record.lastType === 'OUT'
          ? record.lastType
          : null,
    };
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: PropsWithChildren) {
  // Sunucuda ve hydration sırasında oturum "yok / yükleniyor" kabul edilir;
  // böylece sunucu ile istemci çıktısı aynı olur (hydration hatası oluşmaz).
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  const employee = useMemo(() => parseSession(raw), [raw]);

  const signIn = useCallback((next: EmployeeSession) => {
    writeRaw(JSON.stringify(next));
  }, []);

  const signOut = useCallback(() => {
    writeRaw(null);
  }, []);

  const setLastType = useCallback((type: 'IN' | 'OUT' | null) => {
    const current = parseSession(readRaw());
    if (!current || (current.lastType ?? null) === type) return;
    writeRaw(JSON.stringify({ ...current, lastType: type }));
  }, []);

  const value = useMemo(
    () => ({ signIn, signOut, setLastType, employee, isLoading: !hydrated }),
    [signIn, signOut, setLastType, employee, hydrated]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
