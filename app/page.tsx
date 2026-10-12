'use client';

import AuthGuard from '../components/AuthGuard';
import HomePage from '../components/HomePage';

export default function Page() {
  return (
    <AuthGuard requireAuth={true}>
      <HomePage />
    </AuthGuard>
  );
}