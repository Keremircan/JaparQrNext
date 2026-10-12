'use client';

import { useState, type PropsWithChildren } from 'react';
import { SessionContext, type EmployeeSession } from './sessionTypes';

const STORAGE_KEY = 'user_session';

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<string | null>(() => {
    // Next.js sunucu tarafında çalışırken (SSR) window tanımsızdır
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      console.error('Oturum bilgisi okunamadı:', error);
      return null;
    }
  });

  let employee: EmployeeSession | null = null;
  if (session) {
    try {
      employee = JSON.parse(session) as EmployeeSession;
    } catch {
      employee = null;
    }
  }

  const signIn = (nextEmployee: EmployeeSession) => {
    const serialized = JSON.stringify(nextEmployee);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      console.error('Oturum kaydedilemedi:', error);
    }
    setSession(serialized);
  };

  const signOut = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Oturum silinemedi:', error);
    }
    setSession(null);
  };

  const setLastType = (type: 'IN' | 'OUT' | null) => {
    if (!employee) return;
    const updated: EmployeeSession = { ...employee, lastType: type };
    const serialized = JSON.stringify(updated);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (error) {
      console.error('Oturum güncellenemedi:', error);
    }
    setSession(serialized);
  };

  return (
    <SessionContext.Provider
      value={{
        signIn,
        signOut,
        setLastType,
        session,
        employee,
        isLoading: false,
        lastType: employee?.lastType ?? null,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}