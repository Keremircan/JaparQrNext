-- registered_hardware_id kolonu kaldırıldıktan sonra reset_employee_device
-- fonksiyonu hâlâ o kolonu güncellemeye çalışıyordu ve çağrıldığında
-- "column registered_hardware_id does not exist" hatası veriyordu.
-- ELLE ÇALIŞTIRILIR (Supabase > SQL Editor).

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
     set device_public_key = null,
         device_bound_at   = null,
         device_label      = null
   where employee_code = p_employee_code;

  insert into device_binding_events (employee_code, event, device_public_key, source)
  values (p_employee_code, 'RESET', v_old_key, 'admin');

  return true;
end;
$$;

revoke execute on function public.reset_employee_device(text) from public, anon, authenticated;
