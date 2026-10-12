'use client';

import AuthGuard from '../../components/AuthGuard';
import SignInPage from '../../components/SignInPage';

export default function LoginPage() {
  return (
    <AuthGuard requireAuth={false}>
      <SignInPage />
    </AuthGuard>
  );
}