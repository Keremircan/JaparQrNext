'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Briefcase,
  Info,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { useSession } from '../context/useSession';
import { formatDate, formatDateTime } from '../lib/datetime';
import { signedPost } from '../lib/deviceId';

type Profile = {
  employeeCode: string;
  fullName: string;
  department: string | null;
  job: string | null;
  shift: string | null;
  shiftType: string | null;
  isActive: boolean;
  hireDate: string | null;
  device: {
    bound: boolean;
    label: string | null;
    boundAt: string | null;
  };
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; profile: Profile }
  | { status: 'error'; message: string };

const FALLBACK = 'Belirtilmemiş';

function Card({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <h2 className="mb-1 flex items-center gap-2 text-[11px] font-bold tracking-[0.8px] text-slate-500 uppercase">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-[13px] text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold break-words text-slate-900">
        {children}
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <span className="inline-block h-4 w-24 animate-pulse rounded bg-slate-200 align-middle" />
  );
}

export default function ProfilePage() {
  const { employee, signOut } = useSession();
  const router = useRouter();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const employeeCode = employee?.employeeCode;

  useEffect(() => {
    if (!employeeCode) return;
    let ignore = false;

    const load = async () => {
      try {
        const response = await signedPost('/api/profile', { employeeCode });
        const data = await response.json();
        if (ignore) return;
        setState(
          response.ok && data?.success
            ? { status: 'ready', profile: data.profile as Profile }
            : {
                status: 'error',
                message: data?.message || 'Profil bilgileri alınamadı.',
              }
        );
      } catch {
        if (!ignore) {
          setState({
            status: 'error',
            message: 'Sunucuya erişilemedi. Bağlantınızı kontrol edin.',
          });
        }
      }
    };
    void load();

    return () => {
      ignore = true;
    };
  }, [employeeCode, attempt]);

  if (!employee) return null;

  const profile = state.status === 'ready' ? state.profile : null;
  const loading = state.status === 'loading';

  // Sunucu yanıtı gelene kadar (veya gelmezse) oturumdaki bilgiler gösterilir
  const fullName = profile?.fullName || employee.name || 'Personel';
  const job = profile?.job ?? employee.job ?? null;
  const department = profile?.department ?? employee.department ?? null;
  const shift = profile?.shift ?? employee.shift ?? null;
  const shiftType = profile?.shiftType ?? employee.shift_type ?? null;
  const shiftText = [shift, shiftType].filter(Boolean).join(' / ');
  const isActive = profile?.isActive ?? true;

  const initials = fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toLocaleUpperCase('tr-TR');

  const handleSignOut = () => {
    signOut();
    router.replace('/login');
  };

  const device = profile?.device;

  return (
    <div className="min-h-dvh bg-slate-50 px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-[calc(32px+env(safe-area-inset-bottom))] text-slate-900">
      {/* Üst Bar */}
      <header className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/')}
          aria-label="Ana sayfaya dön"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="m-0 text-lg font-bold">Profilim</h1>
      </header>

      {/* Avatar & Kimlik */}
      <section className="mb-4 flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-900 text-2xl font-bold text-white">
          {initials}
        </div>
        <p className="mt-3 mb-0 text-xl font-bold">{fullName}</p>
        <p className="mt-1 mb-0 text-sm text-slate-500">{job ?? 'Personel'}</p>
        <span
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            isActive
              ? 'bg-green-100 text-green-700'
              : 'bg-slate-200 text-slate-600'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isActive ? 'bg-green-600' : 'bg-slate-500'
            }`}
          />
          {isActive ? 'Aktif Personel' : 'Pasif Personel'}
        </span>
      </section>

      {/* Şirket & Görev Bilgileri */}
      <Card icon={<Briefcase size={14} />} title="Şirket ve görev bilgileri">
        <Row label="Sicil No">{employee.employeeCode}</Row>
        <Row label="Departman">{department ?? FALLBACK}</Row>
        <Row label="Görev / Pozisyon">{job ?? FALLBACK}</Row>
        <Row label="Tanımlı Vardiya">{shiftText || FALLBACK}</Row>
        <Row label="İşe Giriş Tarihi">
          {loading ? (
            <Skeleton />
          ) : profile?.hireDate ? (
            formatDate(profile.hireDate)
          ) : (
            FALLBACK
          )}
        </Row>
      </Card>

      {/* Cihaz Güvenliği */}
      <Card icon={<Smartphone size={14} />} title="Cihaz güvenliği">
        {state.status === 'error' ? (
          <div className="py-3">
            <p className="m-0 text-sm text-red-600">{state.message}</p>
            <button
              type="button"
              onClick={() => {
                setState({ status: 'loading' });
                setAttempt((n) => n + 1);
              }}
              className="mt-3 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 active:bg-slate-100"
            >
              Yeniden dene
            </button>
          </div>
        ) : (
          <>
            <Row label="Durum">
              {loading ? (
                <Skeleton />
              ) : device?.bound ? (
                <span className="inline-flex items-center gap-1.5 text-green-700">
                  <ShieldCheck size={16} />
                  Kayıtlı · Bu cihaza bağlı
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-amber-600">
                  <ShieldAlert size={16} />
                  Henüz eşlenmedi
                </span>
              )}
            </Row>
            <Row label="Cihaz">
              {loading ? <Skeleton /> : (device?.label ?? '—')}
            </Row>
            <Row label="Eşleşme Tarihi">
              {loading ? (
                <Skeleton />
              ) : device?.boundAt ? (
                formatDateTime(device.boundAt)
              ) : (
                '—'
              )}
            </Row>
          </>
        )}

        <p className="mt-3 mb-0 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
          <Info size={14} className="mt-0.5 shrink-0" />
          {device && !device.bound
            ? 'Bu cihaz ilk karekod okutmanızda hesabınıza bağlanacaktır.'
            : 'Hesabınız bu cihaza kilitlidir. Telefonunuzu değiştirdiğinizde İnsan Kaynakları veya Amirinizle iletişime geçiniz.'}
        </p>
      </Card>

      {/* Çıkış */}
      <button
        type="button"
        onClick={handleSignOut}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white p-4 text-[15px] font-bold text-red-600 active:bg-red-50"
      >
        <LogOut size={18} />
        Güvenli Çıkış Yap
      </button>

      <p className="mt-6 mb-0 text-center text-xs text-slate-400">
        Japar PDKS v{process.env.NEXT_PUBLIC_APP_VERSION} · PWA
      </p>
    </div>
  );
}
