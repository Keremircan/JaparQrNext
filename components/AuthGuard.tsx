'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useSession } from '../context/useSession';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean; // true ise oturum zorunlu, false ise sadece oturumsuzlar girebilir (login)
}

export default function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { session, isLoading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !session) {
      router.replace('/login');
    } else if (!requireAuth && session) {
      router.replace('/');
    }
  }, [session, isLoading, requireAuth, router]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#ffffff',
        }}
      >
        <Loader2 className="spin" size={36} color="#0f172a" />
      </div>
    );
  }

  if (requireAuth && !session) return null;
  if (!requireAuth && session) return null;

  return <>{children}</>;
}