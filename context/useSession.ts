'use client';

import { useContext } from 'react';
import { SessionContext } from './sessionTypes';

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error('useSession, SessionProvider içinde kullanılmalıdır.');
  }
  return value;
}