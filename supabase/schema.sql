-- TourRide CR · base de datos (Supabase)
-- Se pega UNA vez en Supabase → SQL Editor → Run.

-- ========== Usuarios y roles ==========
-- superadmin = dueño de la app (Ángel) · owner = dueño del negocio · staff = empleado
-- partner = operador socio · driver = chofer
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'pending' check (role in ('superadmin','owner','staff','partner','driver','pending')),
  partner_id text,   -- si es socio: id del socio (p1, p2…)
  driver_id text,    -- si es chofer: id del chofer (d1, d2…)
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'anon')
$$;
create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.my_role() in ('superadmin','owner','staff') $$;

-- cada usuario nuevo queda "pending" hasta que el dueño le da un rol
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists "ver mi perfil" on profiles;
create policy "ver mi perfil" on profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "admin cambia perfiles" on profiles;
create policy "admin cambia perfiles" on profiles for update using (
  public.my_role() = 'superadmin' or (public.my_role() = 'owner' and role <> 'superadmin')
);

-- ========== Catálogo y configuración ==========
-- Cada "colección" de la app se guarda como un documento JSON:
-- públicas: settings, tours, partners_public, rates, places, vehicle_units
-- privadas (solo administración): fleet, drivers, partners
create table if not exists public.app_data (
  key text primary key,
  data jsonb not null,
  is_public boolean not null default false,
  updated_at timestamptz default now()
);
alter table public.app_data enable row level security;
drop policy if exists "leer catálogo público" on app_data;
create policy "leer catálogo público" on app_data for select using (is_public or public.is_admin() or public.my_role() in ('partner','driver'));
drop policy if exists "admin escribe catálogo" on app_data;
create policy "admin escribe catálogo" on app_data for all using (public.is_admin()) with check (public.is_admin());

-- ========== Reservas ==========
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type text not null check (type in ('tour','transfer')),
  status text not null default 'pending',
  date date not null,
  time text not null,
  partner_id text,
  vehicle_type text,
  unit_id text,
  driver_id text,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  total numeric not null default 0,
  deposit numeric not null default 0,
  commission numeric not null default 0,
  details jsonb not null default '{}'::jsonb,   -- resto de datos (tour, hotel, vuelo, pasajeros…)
  created_at timestamptz default now()
);
alter table public.bookings enable row level security;
drop policy if exists "admin ve y cambia reservas" on bookings;
create policy "admin ve y cambia reservas" on bookings for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "socio ve las suyas" on bookings;
create policy "socio ve las suyas" on bookings for select using (
  public.my_role() = 'partner' and partner_id = (select partner_id from profiles where id = auth.uid())
);
drop policy if exists "chofer ve las suyas" on bookings;
create policy "chofer ve las suyas" on bookings for select using (
  public.my_role() = 'driver' and driver_id = (select driver_id from profiles where id = auth.uid())
);

-- El cliente (sin cuenta) crea su reserva con esta función; no puede leer las de otros.
create or replace function public.create_booking(b jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare new_code text;
begin
  loop
    new_code := 'TR-' || (10000 + floor(random() * 90000))::int;
    exit when not exists (select 1 from bookings where code = new_code);
  end loop;
  insert into bookings (code, type, status, date, time, partner_id, vehicle_type, customer_name, customer_phone,
                        customer_email, total, deposit, commission, details)
  values (new_code, b->>'type', case when b->>'status' = 'quote' then 'quote' else 'pending' end,
          (b->>'date')::date, b->>'time', b->>'partnerId', b->>'vehicleId',
          b->'customer'->>'name', b->'customer'->>'phone', b->'customer'->>'email',
          coalesce((b->>'total')::numeric, 0), coalesce((b->>'deposit')::numeric, 0),
          coalesce((b->>'commission')::numeric, 0), b);
  return new_code;
end $$;
grant execute on function public.create_booking(jsonb) to anon, authenticated;

-- El cliente consulta su reserva con el código y su teléfono.
create or replace function public.get_my_booking(p_code text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(b) from bookings b
  where b.code = p_code and regexp_replace(b.customer_phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g')
$$;
grant execute on function public.get_my_booking(text, text) to anon, authenticated;

-- El cliente puede cancelar su propia reserva si todavía está pendiente.
create or replace function public.cancel_my_booking(p_code text, p_phone text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled'
  where code = p_code and status in ('pending','quote')
    and regexp_replace(customer_phone, '\D', '', 'g') = regexp_replace(p_phone, '\D', '', 'g');
  return found;
end $$;
grant execute on function public.cancel_my_booking(text, text) to anon, authenticated;

-- Ocupación de un día (sin datos personales) para calcular cupos y vehículos libres.
create or replace function public.day_load(p_date date) returns table (type text, tour_id text, vehicle_type text, time text, people int, status text)
language sql stable security definer set search_path = public as $$
  select type, details->>'tourId', vehicle_type, time,
         coalesce((details->>'adults')::int, 0) + coalesce((details->>'kids')::int, 0) + coalesce((details->>'pax')::int, 0),
         status
  from bookings where date = p_date and status <> 'cancelled'
$$;
grant execute on function public.day_load(date) to anon, authenticated;

-- ========== Fotos ==========
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict do nothing;
drop policy if exists "fotos públicas" on storage.objects;
create policy "fotos públicas" on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "admin sube fotos" on storage.objects;
create policy "admin sube fotos" on storage.objects for insert with check (bucket_id = 'photos' and public.is_admin());
drop policy if exists "admin borra fotos" on storage.objects;
create policy "admin borra fotos" on storage.objects for delete using (bucket_id = 'photos' and public.is_admin());

-- ========== Permisos de la API (por si "exponer tablas" está apagado) ==========
grant usage on schema public to anon, authenticated;
grant select on public.app_data to anon, authenticated;
grant insert, update, delete on public.app_data to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;
grant select, update on public.profiles to authenticated;
