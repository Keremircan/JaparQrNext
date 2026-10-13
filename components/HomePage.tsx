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
} from 'lucide-react';
import { useSession } from '../context/useSession';
import { formatLongDate, formatTime } from '../lib/datetime';
import '../styles/HomePage.css';

type AttendanceLog = {
  id: number;
  gate: string;
  type: 'IN' | 'OUT';
  createdAt: string; // UTC ISO
};

export default function HomePage() {
  const { employee, isLoading, signOut, setLastType } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [workingTime, setWorkingTime] = useState('0s 0dk');
  const [logList, setLogList] = useState<AttendanceLog[]>([]);

  // Oturum kontrolü (Oturum yüklenene kadar bekle, yoksa login'e yönlendir)
  useEffect(() => {
    if (!isLoading && !employee) {
      router.replace('/login');
    }
  }, [employee, isLoading, router]);

  const today = formatLongDate(new Date());

  const triggerVibrate = (pattern: number | number[] = 30) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Tarayıcı izin vermiyorsa sessizce geç
      }
    }
  };

  const calculateWorkDuration = (logs: AttendanceLog[]) => {
    if (!logs || logs.length === 0) {
      setWorkingTime('0s 0dk');
      return;
    }

    const sorted = [...logs].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let totalMs = 0;
    let lastInTime: Date | null = null;

    for (const log of sorted) {
      const logDate = new Date(log.createdAt);

      if (log.type === 'IN') {
        lastInTime = logDate;
      } else if (log.type === 'OUT' && lastInTime) {
        totalMs += logDate.getTime() - lastInTime.getTime();
        lastInTime = null;
      }
    }

    if (lastInTime) {
      totalMs += Date.now() - lastInTime.getTime();
    }

    const totalMinutes = Math.floor(Math.max(0, totalMs) / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    setWorkingTime(`${hours}s ${minutes}dk`);
  };

  // Veri çekme fonksiyonu
  const fetchLogs = useCallback(async () => {
    if (!employee?.employeeCode) return;

    setLoading(true);

    try {
      const response = await fetch('/api/listLogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeCode: employee.employeeCode.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data?.success) {
        const logs: AttendanceLog[] = data.logList || [];
        setLogList(logs);
        calculateWorkDuration(logs);

        if (logs.length > 0) {
          setLastType(logs[0].type);
        } else {
          setLastType(null);
        }
      } else {
        setLogList([]);
        setWorkingTime('0s 0dk');
        setLastType(null);
      }
    } catch {
      triggerVibrate([50, 50, 50]);
      alert('Sunucuya erişilemedi. İnternet veya ağ bağlantınızı kontrol edin.');
    } finally {
      setLoading(false);
    }
  }, [employee?.employeeCode, setLastType]);

  // Manuel buton yenilemesi
  const handleManualRefresh = async () => {
    if (loading) return;
    triggerVibrate(25);
    await fetchLogs();
  };

  // Sayfa yüklendiğinde logları çek
  useEffect(() => {
    if (!employee?.employeeCode) return;

    let ignore = false;

    queueMicrotask(() => {
      if (!ignore) {
        void fetchLogs();
      }
    });

    return () => {
      ignore = true;
    };
  }, [employee?.employeeCode, fetchLogs]);

  if (isLoading || !employee) {
    return null; // Oturum kontrolü sırasında ekran parlamasını önle
  }

  const initials = (employee?.name ?? 'Ç')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="home-container">
      {/* Üst Bar */}
      <header className="top-bar">
        <div>
          <span className="kicker">JAPAR · DEVAM TAKİBİ</span>
          <h1 className="greeting">Merhaba, {employee?.name ?? 'Çalışan'}</h1>
          <p className="date-text">{today}</p>
        </div>
        <div className="top-actions">
          <button
            onClick={() => void handleManualRefresh()}
            className="icon-refresh-btn"
            title="Yenile"
            disabled={loading}
          >
            <RotateCw className={loading ? 'spin' : ''} size={18} />
          </button>
          <button onClick={signOut} className="sign-out-btn">
            Çıkış
          </button>
        </div>
      </header>

      {/* Profil Kartı */}
      <button
        type="button"
        className="profile-card"
        onClick={() => router.push('/profile')}
        aria-label="Kullanıcı profiline git"
      >
        <div className="avatar">{initials}</div>
        <div className="profile-meta">
          <span className="profile-name">{employee?.name}</span>
          <span className="profile-role">
            {employee?.job ?? 'Personel'} · {employee?.department ?? 'Departman'}
          </span>
          <span className="profile-code">Sicil {employee?.employeeCode}</span>
        </div>
        <div className="status-chip">
          <span className="status-dot" />
          <span className="status-text">Vardiyada</span>
        </div>
        <ChevronRight size={20} className="profile-chevron" aria-hidden="true" />
      </button>

      {/* QR Tarama Aksiyonu */}
      <button onClick={() => router.push('/scan')} className="primary-action-card">
        <div className="primary-icon-wrap">
          <QrCode size={22} color="#FFFFFF" />
        </div>
        <div className="primary-copy">
          <span className="primary-title">QR ile yoklama</span>
          <span className="primary-subtitle">
            Giriş noktasındaki karekodu okutun
          </span>
        </div>
        <ChevronRight size={20} color="#FFFFFF" />
      </button>

      {/* İstatistikler */}
      <section className="stats-row">
        <div className="stat-card">
          <span className="stat-label">Son İşlem</span>
          <span className="stat-value">
            {logList.length > 0 ? formatTime(logList[0].createdAt) : '--:--'}
          </span>
          <span className="stat-hint">
            {logList.length > 0 ? logList[0].gate : 'Kayıt yok'}
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Vardiya</span>
          <span className="stat-value-sm">
            {employee?.shift ?? '08:00 – 16:00'}
          </span>
          <span className="stat-hint">{employee?.shift_type ?? 'Gündüz'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Bugün</span>
          <span className="stat-value">{workingTime}</span>
          <span className="stat-hint">
            {employee?.lastType === 'IN' ? 'İçeride' : 'Mola / Çıkış'}
          </span>
        </div>
      </section>

      {/* Bugünkü Hareketler Başlığı */}
      <div className="section-header-row">
        <h3 className="section-title">Bugünkü hareketler</h3>
        {loading && <Loader2 size={16} className="spin accent-spinner" />}
      </div>

      {/* Log Listesi */}
      <div className="log-list">
        {logList.length === 0 && !loading ? (
          <div className="empty-box">
            <Calendar size={34} className="empty-icon" />
            <p className="empty-text">
              Bugüne ait giriş/çıkış kaydı bulunamadı.
            </p>
          </div>
        ) : (
          logList.map((item, index) => (
            <div
              key={item.id}
              className={`log-item ${index === logList.length - 1 ? 'log-item-last' : ''}`}
            >
              <div
                className={`log-icon-badge ${
                  item.type === 'IN' ? 'badge-in' : 'badge-out'
                }`}
              >
                {item.type === 'IN' ? (
                  <LogIn size={18} color="#16a34a" />
                ) : (
                  <LogOut size={18} color="#dc2626" />
                )}
              </div>
              <div className="log-copy">
                <span className="log-title">
                  {item.type === 'IN' ? 'Giriş' : 'Çıkış'} · {item.gate}
                </span>
                <span className="log-meta">Onaylandı</span>
              </div>
              <span className="log-time">{formatTime(item.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}