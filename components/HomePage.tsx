'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  QrCode,
  ChevronRight,
  LogIn,
  LogOut,
  Calendar,
  RotateCw,
  Loader2,
  WifiOff,
} from 'lucide-react';
import { useSession } from '../context/useSession';
import { apiPost, requiresRelogin } from '../lib/api';
import { formatDate, formatLongDate, formatTime } from '../lib/datetime';
import { getFirstName, getInitials, vibrate } from '../lib/ui';
import TimingBadge, { type Timing } from './TimingBadge';
import '../styles/HomePage.css';

type AttendanceLog = {
  id: number;
  gate: string;
  type: 'IN' | 'OUT';
  createdAt: string; // UTC ISO
  /** Vardiyaya göre durum; vardiya tanımsız veya hareket vardiya dışıysa null */
  timing?: Timing | null;
};

type LogsResponse = {
  logList: AttendanceLog[];
  lastType: 'IN' | 'OUT' | null;
};

// Çalışma süresi sayacının yenilenme aralığı
const CLOCK_TICK_MS = 30_000;

// Giriş-çıkış çiftlerinin toplam süresi; personel hâlâ içerideyse açık kalan
// giriş şu ana kadar sayılır.
function calculateWorkMs(logs: AttendanceLog[], onShift: boolean, now: number): number {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let totalMs = 0;
  let lastIn: number | null = null;

  for (const log of sorted) {
    const time = new Date(log.createdAt).getTime();
    if (log.type === 'IN') {
      lastIn = time;
    } else if (lastIn !== null) {
      totalMs += time - lastIn;
      lastIn = null;
    }
  }

  if (lastIn !== null && onShift) totalMs += now - lastIn;
  return Math.max(0, totalMs);
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  return `${Math.floor(totalMinutes / 60)} sa ${totalMinutes % 60} dk`;
}

export default function HomePage() {
  const { employee, signOut, setLastType } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logList, setLogList] = useState<AttendanceLog[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const employeeCode = employee?.employeeCode;

  // Veri çekme fonksiyonu
  const fetchLogs = useCallback(async () => {
    if (!employeeCode) return;

    setLoading(true);
    const result = await apiPost<LogsResponse>('/api/listLogs', { employeeCode });
    setLoading(false);

    if (result.ok) {
      setLogList(result.data.logList ?? []);
      setLastType(result.data.lastType ?? null);
      setError(null);
      setNow(Date.now());
    } else if (requiresRelogin(result)) {
      // Cihaz hesaba bağlı değil (ör. yönetici sıfırladı): oturum geçersiz
      signOut();
      router.replace('/login');
    } else {
      // Hata durumunda mevcut liste ve vardiya durumu KORUNUR; aksi halde
      // geçici bir sunucu hatası personeli "vardiya dışı" gösterirdi.
      vibrate([50, 50, 50]);
      setError(result.message);
    }
  }, [employeeCode, setLastType, signOut, router]);

  // Manuel buton yenilemesi
  const handleManualRefresh = () => {
    if (loading) return;
    vibrate(25);
    void fetchLogs();
  };

  // Sayfa açıldığında ve uygulama yeniden öne geldiğinde logları çek
  useEffect(() => {
    let ignore = false;

    queueMicrotask(() => {
      if (!ignore) void fetchLogs();
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchLogs();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      ignore = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchLogs]);

  // Çalışma süresi ekranda canlı ilerlesin
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  if (!employee) {
    return null; // AuthGuard yönlendirmeyi yapar
  }

  // Son hareket giriş ise personel içeridedir; çıkış veya kayıt yoksa vardiya dışı
  const onShift = employee.lastType === 'IN';
  const workingTime = formatDuration(calculateWorkMs(logList, onShift, now));
  const todayText = formatDate(now);
  const lastLog = logList[0];

  return (
    <div className="home-container">
      {/* Üst Bar */}
      <header className="top-bar">
        <div>
          <span className="kicker">JAPAR · DEVAM TAKİBİ</span>
          <h1 className="greeting">Merhaba, {getFirstName(employee.name)}</h1>
          <p className="date-text">{formatLongDate(now)}</p>
        </div>
        <button
          type="button"
          onClick={handleManualRefresh}
          className="icon-refresh-btn"
          aria-label="Yenile"
          disabled={loading}
        >
          <RotateCw className={loading ? 'spin' : ''} size={20} />
        </button>
      </header>

      {/* Bağlantı / Sunucu Hatası */}
      {error && (
        <div className="error-banner" role="alert">
          <WifiOff size={18} className="error-banner-icon" />
          <span className="error-banner-text">{error}</span>
          <button
            type="button"
            className="error-banner-btn"
            onClick={handleManualRefresh}
            disabled={loading}
          >
            Tekrar dene
          </button>
        </div>
      )}

      {/* Profil Kartı */}
      <button
        type="button"
        className="profile-card"
        onClick={() => router.push('/profile')}
        aria-label="Kullanıcı profiline git"
      >
        <div className="avatar">{getInitials(employee.name)}</div>
        <div className="profile-meta">
          <span className="profile-name">{employee.name}</span>
          <span className="profile-role">
            {employee.job ?? 'Personel'} · {employee.department ?? 'Departman'}
          </span>
          <span className="profile-code">Sicil {employee.employeeCode}</span>
        </div>
        <div className={`status-chip ${onShift ? 'status-on' : 'status-off'}`}>
          <span className="status-dot" />
          <span className="status-text">
            {onShift ? 'Vardiyada' : 'Vardiya Dışı'}
          </span>
        </div>
        <ChevronRight size={20} className="profile-chevron" aria-hidden="true" />
      </button>

      {/* QR Tarama Aksiyonu */}
      <button
        type="button"
        onClick={() => router.push('/scan')}
        className="primary-action-card"
      >
        <div className="primary-icon-wrap">
          <QrCode size={26} color="#FFFFFF" />
        </div>
        <div className="primary-copy">
          <span className="primary-title">
            {onShift ? 'Çıkış için QR okut' : 'Giriş için QR okut'}
          </span>
          <span className="primary-subtitle">
            Kapıdaki ekranda görünen karekodu okutun
          </span>
        </div>
        <ChevronRight size={22} color="#FFFFFF" />
      </button>

      {/* İstatistikler */}
      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Son İşlem</span>
          <span className="stat-value">
            {lastLog ? formatTime(lastLog.createdAt) : '--:--'}
          </span>
          <span className="stat-hint">
            {lastLog ? (lastLog.type === 'IN' ? 'Giriş' : 'Çıkış') : 'Kayıt yok'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Vardiya</span>
          <span className="stat-value-sm">{employee.shift ?? '—'}</span>
          <span className="stat-hint">{employee.shift_type ?? 'Tanımsız'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Bugün</span>
          <span className="stat-value">{workingTime}</span>
          <span className="stat-hint">{onShift ? 'İçeride' : 'Vardiya dışı'}</span>
        </div>
      </section>

      {/* Bugünkü Hareketler Başlığı */}
      <div className="section-header-row">
        <h2 className="section-title">Bugünkü hareketler</h2>
        {loading && <Loader2 size={18} className="spin" color="#2563eb" />}
      </div>

      {/* Log Listesi */}
      <div className="log-list">
        {logList.length === 0 ? (
          <div className="empty-box">
            <Calendar size={34} className="empty-icon" />
            <p className="empty-text">
              {loading
                ? 'Hareketler yükleniyor...'
                : 'Bugüne ait giriş/çıkış kaydı bulunamadı.'}
            </p>
          </div>
        ) : (
          logList.map((item) => {
            // Gece vardiyasında dün başlayan giriş de listede yer alır
            const logDate = formatDate(item.createdAt);
            return (
              <div key={item.id} className="log-item">
                <div
                  className={`log-icon-badge ${
                    item.type === 'IN' ? 'badge-in' : 'badge-out'
                  }`}
                >
                  {item.type === 'IN' ? (
                    <LogIn size={20} color="#15803d" />
                  ) : (
                    <LogOut size={20} color="#b91c1c" />
                  )}
                </div>
                <div className="log-copy">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="log-title">
                      {item.type === 'IN' ? 'Giriş' : 'Çıkış'}
                    </span>
                    <TimingBadge timing={item.timing} />
                  </span>
                  <span className="log-meta">
                    {item.gate}
                    {logDate !== todayText && ` · ${logDate}`}
                  </span>
                </div>
                <span className="log-time">{formatTime(item.createdAt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
