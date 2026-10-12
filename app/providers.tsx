'use client';

import { SessionProvider } from '../context/SessionContext'; 

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}