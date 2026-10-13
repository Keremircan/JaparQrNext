'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useSession } from '../context/useSession';
import { apiPost } from '../lib/api';
import { vibrate } from '../lib/ui';
import '../styles/SignInPage.css';

type LoginResponse = {
  user: {
    employeeCode: string;
    fullName: string | null;
    department: string | null;
    job: string | null;
    shift: string | null;
    shift_type: string | null;
  };
};

export default function SignInPage() {
  const { signIn } = useSession();
  const router = useRouter();

  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setErrorMessage('');

    if (!employeeCode.trim() || !password.trim()) {
      setErrorMessage('Sicil numarası ve şifre gereklidir.');
      vibrate([40, 40]);
      return;
    }

    setLoading(true);
    vibrate(25);

    // İstek cihaz anahtarıyla imzalanır; sunucu cihazı personele bağlar/denetler
    const result = await apiPost<LoginResponse>('/api/login', {
      employeeCode: employeeCode.trim(),
      password: password.trim(),
    });
    setLoading(false);

    if (!result.ok) {
      vibrate([60, 60, 60]);
      setErrorMessage(result.message);
      return;
    }

    // Sayfa gizlenince durum korunduğu için (bkz. cacheComponents) şifre
    // bellekte ve çıkış sonrası formda kalmasın
    setPassword('');
    setShowPassword(false);

    const { user } = result.data;
    signIn({
      name: user.fullName || 'Personel',
      employeeCode: user.employeeCode,
      department: user.department,
      job: user.job,
      shift: user.shift,
      shift_type: user.shift_type,
    });

    vibrate([40, 60, 40]);
    router.replace('/');
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
            <div className="error-alert" role="alert">
              {errorMessage}
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
              placeholder="EMP10293"
              autoCapitalize="characters"
              autoComplete="username"
              autoCorrect="off"
              spellCheck={false}
              maxLength={50}
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value.toUpperCase())}
            />

            <label className="form-label" htmlFor="password">
              Şifre
            </label>
            <div className="password-field">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input password-input"
                placeholder="••••••••"
                autoComplete="current-password"
                maxLength={200}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
              >
                {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
              </button>
            </div>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? <Loader2 className="spin" size={22} /> : 'Giriş yap'}
            </button>
          </form>
        </div>

        <p className="footer-note">Japar Fabrika · Güvenli yoklama altyapısı</p>
      </div>
    </div>
  );
}
