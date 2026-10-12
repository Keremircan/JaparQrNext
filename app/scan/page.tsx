'use client';

import AuthGuard from '../../components/AuthGuard';
import ScannerPage from '../../components/ScannerPage';

export default function ScanPage() {
  return (
    <AuthGuard requireAuth={true}>
      <ScannerPage />
    </AuthGuard>
  );
}