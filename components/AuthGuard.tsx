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
  const { employee, isLoading } = useSession();
  const router = useRouter();
  const signedIn = Boolean(employee);

  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !signedIn) {
      router.replace('/login');
    } else if (!requireAuth && signedIn) {
      router.replace('/');
    }
  }, [signedIn, isLoading, requireAuth, router]);

  // Oturum okunana veya yönlendirme tamamlanana kadar
  if (isLoading || requireAuth !== signedIn) {
    return (
      <div className="app-loading" role="status" aria-label="Yükleniyor">
        <Loader2 className="spin" size={36} />
      </div>
    );
  }

  return <>{children}</>;
}
