'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useSession } from '../context/useSession';
import '../styles/SignInPage.css'; // veya CSS dosyanızın bulunduğu yol

export default function SignInPage() {
  const { signIn } = useSession();
  const router = useRouter();

  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const triggerVibrate = (pattern: number | number[] = 30) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Tarayıcı desteklemiyorsa sessizce geç
      }
    }
  };

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');

    if (!employeeCode.trim() || !password.trim()) {
      setErrorMessage('Sicil numarası ve şifre gereklidir.');
      triggerVibrate([40, 40]);
      return;
    }

    setLoading(true);
    triggerVibrate(25);

    try {
      // Next.js içinde doğrudan aynı origin'deki API route'u çağrılır:
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: employeeCode.trim(),
          password: password.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // UI yumuşatma beklemesi
        await new Promise((resolve) => setTimeout(resolve, 450));

        signIn({
          name: data.user.fullName || 'Personel',
          employeeCode: data.user.employeeCode,
          department: data.user.department,
          job: data.user.job,
          shift: data.user.shift,
          shift_type: data.user.shift_type,
        });

        triggerVibrate([40, 60, 40]);
        router.replace('/');
      } else {
        triggerVibrate([60, 60, 60]);
        setErrorMessage(data.message || 'Giriş yapılamadı.');
      }
    } catch {
      triggerVibrate([60, 60, 60]);
      setErrorMessage('Sunucuya erişilemedi. İnternet veya Wi-Fi bağlantınızı kontrol edin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signin-root">
      <div className="signin-wrapper">
        {/* Marka / Logo Alanı */}
        <div className="brand-block">
          <div className="mark-badge">
            <span className="mark-text">J</span>
          </div>
          <h1 className="brand-title">JAPAR</h1>
          <p className="brand-sub">Personel devam takip sistemi</p>
        </div>

        {/* Giriş Kartı */}
        <div className="signin-card">
          <h2 className="card-title">Personel girişi</h2>
          <p className="card-hint">
            Mesai kayıtları için sicil numaranız ve şifrenizle oturum açın.
          </p>

          {errorMessage && (
            <div className="error-alert">
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="signin-form">
            <label className="form-label" htmlFor="employeeCode">
              Sicil numarası
            </label>
            <input
              id="employeeCode"
              type="text"
              className="form-input"
              placeholder="EMP-10293"
              autoCapitalize="characters"
              autoComplete="username"
              autoCorrect="off"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
            />

            <label className="form-label" htmlFor="password">
              Şifre
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="submit"
              className="submit-button"
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="button-spinner" size={20} />
              ) : (
                'Giriş yap'
              )}
            </button>
          </form>
        </div>

        <p className="footer-note">Japar Fabrika · Güvenli yoklama altyapısı</p>
      </div>
    </div>
  );
}