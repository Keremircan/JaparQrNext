'use client';

import AuthGuard from '../../components/AuthGuard';
import ProfilePage from '../../components/ProfilePage';

export default function Profile() {
  return (
    <AuthGuard requireAuth={true}>
      <ProfilePage />
    </AuthGuard>
  );
}
