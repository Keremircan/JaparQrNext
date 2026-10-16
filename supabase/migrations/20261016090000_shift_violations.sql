-- Vardiya ihlalleri: geç gelme ve erken çıkma kayıtları
--
-- ELLE ÇALIŞTIRILIR (Supabase > SQL Editor). Uygulama bu tablo yokken de
-- giriş/çıkış kaydetmeye devam eder; yalnızca ihlal kaydı atlanır ve sunucu
-- günlüğüne uyarı yazılır.
--
-- Kayıtları /api/verify yazar (lib/shiftTiming.ts kuralları, tolerans:
-- SHIFT_TOLERANCE_MINUTES ortam değişkeni, varsayılan 3 dk).

create table if not exists public.shift_violations (
  id                bigint generated always as identity primary key,
  employee_code     varchar(50)  not null
                    references public.employees (employee_code) on update cascade,
  -- İhlal anındaki ad soyad (personel adı sonradan değişse de raporda korunur)
  full_name         varchar(100) not null,
  duration_minutes  integer      not null check (duration_minutes > 0),
  reason            text         not null check (reason in ('geç geldi', 'erken çıktı')),
  -- Vardiyanın başladığı gün (Türkiye saati). Gece vardiyasında 23:00'te
  -- başlayan vardiyanın ertesi sabahki erken çıkışı, başladığı güne yazılır.
  action_date       date         not null,
  -- İhlale yol açan giriş/çıkış hareketi; aynı hareket için ikinci kayıt oluşmaz
  attendance_log_id bigint       not null unique
                    references public.attendance_logs (id) on delete cascade,
  created_at        timestamptz  not null default now()
);

comment on table public.shift_violations is
  'Vardiya ihlalleri (geç gelme / erken çıkma). Negatif puan / ceza süreçleri için baz veri.';

-- Personel bazlı ve tarih aralıklı raporlar için (FK sütununu da kapsar)
create index if not exists shift_violations_employee_date_idx
  on public.shift_violations (employee_code, action_date desc);

-- Tüm personelin tarih aralığı raporu (yönetim paneli) için
create index if not exists shift_violations_action_date_idx
  on public.shift_violations (action_date);

-- Not: employees ve attendance_logs tablolarıyla tutarlı olarak RLS açılmadı
-- (yönetim paneli aynı veritabanına bağlanacak). Panel sunucu tarafından
-- bağlanacaksa bu tabloda da RLS açılması önerilir.
