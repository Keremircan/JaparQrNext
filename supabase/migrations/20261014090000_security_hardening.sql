-- Güvenlik ve veri bütünlüğü sıkılaştırması
--
-- ELLE ÇALIŞTIRILIR (Supabase > SQL Editor). Uygulama bu dosya çalıştırılmadan
-- da çalışır; ancak 1. adım yapılmadıkça tablolar Supabase REST API'sinden
-- anon anahtarıyla okunup değiştirilebilir durumdadır.

-- 1) RLS: employees ve attendance_logs yalnızca sunucudan (postgres rolü)
--    erişilebilir olsun. Politika tanımlanmadığı için anon/authenticated
--    anahtarlarıyla hiçbir satır okunamaz/yazılamaz. Bu proje veritabanına
--    postgres rolüyle bağlandığından etkilenmez.
--    DİKKAT: Bu tablolara anon anahtarla erişen başka bir uygulamanız varsa
--    (ör. yönetim paneli) o uygulama çalışmayı durdurur.
alter table public.employees       enable row level security;
alter table public.attendance_logs enable row level security;

revoke all on public.employees             from anon, authenticated;
revoke all on public.attendance_logs       from anon, authenticated;
revoke all on public.device_binding_events from anon, authenticated;

-- 2) attendance_logs bütünlüğü
--    Aşağıdaki kısıtlar mevcut veride aykırı satır varsa hata verir; önce şu
--    sorgularla kontrol edin (ikisi de 0 satır dönmeli):
--      select * from attendance_logs where log_type not in ('IN','OUT') or created_at is null;
--      select l.* from attendance_logs l left join employees e using (employee_code) where e.id is null;
alter table public.attendance_logs
  alter column created_at set not null,
  alter column created_at set default now();

alter table public.attendance_logs
  add constraint attendance_logs_log_type_check check (log_type in ('IN', 'OUT'));

alter table public.attendance_logs
  add constraint attendance_logs_employee_code_fkey
  foreign key (employee_code) references public.employees (employee_code)
  on update cascade;

-- 3) İşe giriş tarihi (profil sayfası bu kolonu varsa kendiliğinden gösterir)
alter table public.employees
  add column if not exists hire_date date;

-- 4) İSTEĞE BAĞLI — eski cihaz kimliği kolonunun kaldırılması.
--    Tüm personel yeni sisteme geçtikten sonra (aşağıdaki sorgu 0 dönünce)
--    çalıştırın ve ardından lib/deviceBinding.ts içindeki eski kimlik
--    kontrolünü kaldırın:
--      select count(*) from employees where registered_hardware_id is not null;
--
-- alter table public.employees drop column registered_hardware_id;
