-- Güvenlik ve veri bütünlüğü sıkılaştırması
--
-- ELLE ÇALIŞTIRILIR (Supabase > SQL Editor). Uygulama bu dosya çalıştırılmadan
-- da çalışır.

-- 1) RLS — UYGULANMADI (bilinçli karar, 2026-10-13):
--    Yönetim paneli aynı veritabanına bağlanacağı için employees ve
--    attendance_logs tablolarında satır düzeyi güvenlik AÇILMIYOR.
--    Sonuç: bu tablolar Supabase REST API'sinden anon anahtarıyla okunup
--    değiştirilebilir durumdadır. Panel bu tablolara sunucu tarafından
--    (service_role anahtarı veya doğrudan Postgres bağlantısı) erişecek şekilde
--    kurulursa aşağıdaki satırlar paneli bozmadan açılabilir.
--
-- alter table public.employees       enable row level security;
-- alter table public.attendance_logs enable row level security;
-- revoke all on public.employees       from anon, authenticated;
-- revoke all on public.attendance_logs from anon, authenticated;

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

-- 4) Eski cihaz kimliği kolonunun kaldırılması.
--    Uygulama kodu artık bu kolonu kullanmıyor. Kolonu kaldırdıktan sonra
--    20261014100000_reset_function_without_legacy_column.sql dosyasını da
--    çalıştırın; aksi halde reset_employee_device fonksiyonu hata verir.
alter table public.employees drop column if exists registered_hardware_id;
