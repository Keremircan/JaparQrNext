-- Cihaz Eşleme (Device Binding)
--
-- Her telefon, tarayıcıda dışa aktarılamayan (non-extractable) bir ECDSA P-256
-- anahtar çifti üretir. Açık anahtar personele bağlanır; sonraki her giriş ve
-- QR doğrulama isteği bu anahtarla imzalanır (bkz. lib/deviceBinding.ts).

-- 1) employees: bağlı cihazın açık anahtarı
alter table public.employees
  add column if not exists device_public_key varchar(100),
  add column if not exists device_bound_at   timestamptz,
  add column if not exists device_label      varchar(255);

comment on column public.employees.device_public_key is
  'Bağlı cihazın ECDSA P-256 açık anahtarı (raw, base64url). NULL = cihaz bağlı değil, ilk girişte bağlanır.';
comment on column public.employees.device_label is
  'Bağlanan cihazın User-Agent bilgisi (yöneticiye bilgi amaçlı).';
comment on column public.employees.registered_hardware_id is
  'ESKİ localStorage kimliği. Yalnızca eski kayıtların yeni sisteme geçişinde kullanılır; geçişten sonra NULL olur.';

-- Bir cihaz yalnızca tek bir personele bağlanabilir
create unique index if not exists employees_device_public_key_key
  on public.employees (device_public_key)
  where device_public_key is not null;

-- 2) Denetim kaydı: bağlama, reddedilen denemeler ve sıfırlamalar
create table if not exists public.device_binding_events (
  id                bigint generated always as identity primary key,
  employee_code     varchar(50) not null,
  event             varchar(20) not null
                    check (event in ('BOUND', 'MISMATCH', 'IN_USE', 'RESET')),
  device_public_key varchar(100),
  device_label      varchar(255),
  source            varchar(20),
  created_at        timestamptz not null default now()
);

create index if not exists idx_device_binding_events_emp_date
  on public.device_binding_events (employee_code, created_at desc);

-- Politika tanımlanmadığı için anon/authenticated API anahtarlarıyla erişilemez;
-- uygulama (postgres rolü) ve Supabase paneli erişmeye devam eder.
alter table public.device_binding_events enable row level security;

-- 3) Yönetici sıfırlaması
--    Supabase SQL Editor:  select public.reset_employee_device('EMP-10293');
--    Personel bir sonraki girişinde yeni telefonu otomatik olarak bağlanır.
create or replace function public.reset_employee_device(p_employee_code text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_old_key varchar(100);
begin
  select device_public_key into v_old_key
    from employees
   where employee_code = p_employee_code
     for update;

  if not found then
    return false;
  end if;

  update employees
     set device_public_key      = null,
         device_bound_at        = null,
         device_label           = null,
         registered_hardware_id = null
   where employee_code = p_employee_code;

  insert into device_binding_events (employee_code, event, device_public_key, source)
  values (p_employee_code, 'RESET', v_old_key, 'admin');

  return true;
end;
$$;

-- public şemasındaki fonksiyonlar varsayılan olarak Supabase API'sinden (RPC)
-- çağrılabilir; sıfırlamayı yalnızca yöneticiye bırak.
revoke execute on function public.reset_employee_device(text) from public, anon, authenticated;

-- 4) ÖNERİLİR (bilinçli olarak kapalı bırakıldı):
--    employees ve attendance_logs tablolarında RLS kapalı. Supabase anon
--    anahtarını bilen biri bu tabloları REST API üzerinden okuyup değiştirebilir
--    (device_public_key'i silerek cihaz kilidini aşmak dahil). Bu tablolara
--    anon anahtarla erişen başka bir uygulamanız (ör. yönetim paneli) YOKSA
--    aşağıdaki satırları açın; bu proje postgres rolüyle bağlandığı için etkilenmez.
--
-- alter table public.employees       enable row level security;
-- alter table public.attendance_logs enable row level security;
