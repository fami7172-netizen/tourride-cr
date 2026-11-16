-- ========== Asistente de IA: límite de uso diario ==========
-- Cuenta cuántas preguntas hace cada visitante por día (sin guardar su IP, solo una huella)
-- y corta cuando se pasa del límite, para que nadie gaste la cuenta de IA.
create table if not exists public.assistant_hits (
  day date not null default current_date,
  key text not null,
  n int not null default 0,
  primary key (day, key)
);
alter table public.assistant_hits enable row level security; -- sin políticas: nadie la lee desde la app

create or replace function public.assistant_hit(p_key text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_st jsonb := coalesce((select data from app_data where key = 'settings'), '{}'::jsonb);
  v_total int; v_mine int;
begin
  delete from assistant_hits where day < current_date - 7;
  select coalesce(sum(n), 0) into v_total from assistant_hits where day = current_date;
  if v_total >= coalesce((v_st->>'assistantDailyLimit')::int, 300) then return false; end if;
  insert into assistant_hits (day, key, n) values (current_date, p_key, 1)
    on conflict (day, key) do update set n = assistant_hits.n + 1
    returning n into v_mine;
  return v_mine <= 30;
end $$;
revoke execute on function public.assistant_hit(text) from public, anon, authenticated;
grant execute on function public.assistant_hit(text) to service_role;
