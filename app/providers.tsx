'use client';

import { useEffect } from 'react';
import { SessionProvider } from '../context/SessionContext';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('Service worker kaydı başarısız:', err);
      });
    }
  }, []);

  return <SessionProvider>{children}</SessionProvider>;
}