'use client';

import { createContext } from 'react';

export type EmployeeSession = {
  name: string;
  employeeCode: string;
  department: string;
  job: string;
  shift: string;
  shift_type: string;
  lastType?: 'IN' | 'OUT' | null;
};

export type SessionContextValue = {
  signIn: (employee: EmployeeSession) => void;
  signOut: () => void;
  setLastType: (type: 'IN' | 'OUT' | null) => void;
  session?: string | null;
  employee: EmployeeSession | null;
  isLoading: boolean;
  lastType?: 'IN' | 'OUT' | null;
};

export const SessionContext = createContext<SessionContextValue | null>(null);