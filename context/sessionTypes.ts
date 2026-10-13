'use client';

import { createContext } from 'react';

export type EmployeeSession = {
  name: string;
  employeeCode: string;
  // Veritabanında boş olabilen alanlar
  department: string | null;
  job: string | null;
  shift: string | null;
  shift_type: string | null;
  lastType?: 'IN' | 'OUT' | null;
};

export type SessionContextValue = {
  signIn: (employee: EmployeeSession) => void;
  signOut: () => void;
  setLastType: (type: 'IN' | 'OUT' | null) => void;
  employee: EmployeeSession | null;
  /** Sunucu render'ı ve hydration sırasında true: oturum henüz okunmadı */
  isLoading: boolean;
};

export const SessionContext = createContext<SessionContextValue | null>(null);
