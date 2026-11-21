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
-- El PRECIO lo calcula aquí la base de datos con las tarifas guardadas (no se confía en lo que manda el celular),
-- revisa los cupos del tour y evita reservas repetidas por doble clic.
drop function if exists public.create_booking(jsonb);
create or replace function public.create_booking(b jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_st jsonb := coalesce((select data from app_data where key = 'settings'), '{}'::jsonb);
  v_tour jsonb; v_rate jsonb; v_partner jsonb;
  v_type text := b->>'type';
  v_date date := (b->>'date')::date;
  v_time text := b->>'time';
  v_phone text := regexp_replace(coalesce(b->'customer'->>'phone', ''), '\D', '', 'g');
  v_status text := 'pending';
  v_adults int := greatest(coalesce((b->>'adults')::int, 0), 0);
  v_kids int := greatest(coalesce((b->>'kids')::int, 0), 0);
  v_pax int := greatest(coalesce((b->>'pax')::int, 0), 0);
  v_people int; v_used int; v_pct numeric;
  v_tour_amount numeric := 0; v_discount numeric := 0; v_pickup_amount numeric := 0;
  v_unit numeric := 0; v_total numeric := 0; v_deposit numeric := 0; v_commission numeric := 0;
  v_dup text; v_details jsonb;
begin
  if coalesce(trim(b->'customer'->>'name'), '') = '' or length(v_phone) < 8 then raise exception 'Faltan nombre o teléfono'; end if;
  if v_date is null or v_date < current_date - 1 or v_date > current_date + 730 then raise exception 'Fecha no válida'; end if;
  if v_type not in ('tour', 'transfer') then raise exception 'Tipo no válido'; end if;

  -- doble clic: la misma reserva en los últimos 10 minutos devuelve el mismo código
  select bk.code into v_dup from bookings bk
  where bk.type = v_type and bk.date = v_date and bk.time = v_time and bk.status <> 'cancelled'
    and right(regexp_replace(bk.customer_phone, '\D', '', 'g'), 8) = right(v_phone, 8)
    and coalesce(bk.details->>'tourId', '') = coalesce(b->>'tourId', '')
    and coalesce(bk.details->>'from', '') = coalesce(b->>'from', '') and coalesce(bk.details->>'to', '') = coalesce(b->>'to', '')
    and bk.created_at > now() - interval '10 minutes'
  limit 1;
  if v_dup is not null then
    return (select jsonb_build_object('code', bk.code, 'status', bk.status, 'total', bk.total, 'deposit', bk.deposit) from bookings bk where bk.code = v_dup);
  end if;

  if v_type = 'tour' then
    select t into v_tour from jsonb_array_elements(coalesce((select data from app_data where key = 'tours'), '[]'::jsonb)) t
      where t->>'id' = b->>'tourId' and coalesce((t->>'active')::boolean, true);
    if v_tour is null then raise exception 'Tour no disponible'; end if;
    if not (v_tour->'schedules') ? v_time then raise exception 'Horario no válido'; end if;
    v_people := v_adults + v_kids;
    if v_adults < 1 or v_people > 60 then raise exception 'Cantidad de personas no válida'; end if;
    select coalesce(sum(coalesce((bk.details->>'adults')::int, 0) + coalesce((bk.details->>'kids')::int, 0)), 0) into v_used
      from bookings bk
      where bk.type = 'tour' and bk.details->>'tourId' = v_tour->>'id' and bk.date = v_date and bk.time = v_time and bk.status <> 'cancelled';
    if v_used + v_people > coalesce((v_tour->>'capacity')::int, 999) then raise exception 'No hay cupos suficientes'; end if;
    if coalesce((v_st->>'highSeason')::boolean, false) then
      v_tour_amount := v_adults * coalesce(nullif(v_tour->>'highAdult', '')::numeric, (v_tour->>'priceAdult')::numeric)
                   + v_kids * coalesce(nullif(v_tour->>'highChild', '')::numeric, (v_tour->>'priceChild')::numeric);
    else
      v_tour_amount := v_adults * (v_tour->>'priceAdult')::numeric + v_kids * (v_tour->>'priceChild')::numeric;
    end if;
    v_pct := coalesce((v_st->'coupons'->>upper(coalesce(b->>'coupon', '')))::numeric, 0);
    v_discount := round(v_tour_amount * v_pct / 100);
    if coalesce((b->>'pickup')::boolean, false) then
      v_pickup_amount := v_people * coalesce((v_st->>'hotelPickupPerPerson')::numeric, 0);
    end if;
    v_total := v_tour_amount - v_discount + v_pickup_amount;
    select p into v_partner from jsonb_array_elements(coalesce((select data from app_data where key = 'partners'), '[]'::jsonb)) p
      where p->>'id' = v_tour->>'partnerId';
    v_commission := round((v_tour_amount - v_discount) * coalesce((v_partner->>'commission')::numeric, 0) / 100);
  else
    if v_pax < 1 or v_pax > 60 then raise exception 'Cantidad de pasajeros no válida'; end if;
    select r into v_rate from jsonb_array_elements(coalesce((select data from app_data where key = 'rates'), '[]'::jsonb)) r
      where (r->>'from' = b->>'from' and r->>'to' = b->>'to') or (r->>'from' = b->>'to' and r->>'to' = b->>'from')
      limit 1;
    v_unit := coalesce(nullif(v_rate->>(b->>'vehicleId'), '')::numeric, 0);
    if v_unit <= 0 then
      v_status := 'quote';   -- sin tarifa: el dueño cotiza
    elsif b->>'vehicleId' in ('shuttle', 'boat') then
      v_total := v_unit * v_pax;
    else
      v_total := v_unit;
    end if;
  end if;
  v_deposit := round(v_total * coalesce((v_st->>'depositPct')::numeric, 0) / 100);

  loop
    v_code := 'TR-' || (10000 + floor(random() * 90000))::int;
    exit when not exists (select 1 from bookings bk where bk.code = v_code);
  end loop;
  v_details := b || jsonb_build_object('code', v_code, 'tourAmount', v_tour_amount, 'discount', v_discount, 'pickupAmount', v_pickup_amount,
                                     'unit', v_unit, 'total', v_total, 'deposit', v_deposit, 'commission', v_commission, 'status', v_status);
  if v_type = 'tour' then v_details := v_details || jsonb_build_object('partnerId', v_tour->>'partnerId', 'tourName', v_tour->'name', 'location', v_tour->>'location'); end if;
  insert into bookings (code, type, status, date, time, partner_id, vehicle_type, customer_name, customer_phone,
                        customer_email, total, deposit, commission, details)
  values (v_code, v_type, v_status, v_date, v_time, v_details->>'partnerId', b->>'vehicleId',
          trim(b->'customer'->>'name'), b->'customer'->>'phone', b->'customer'->>'email',
          v_total, v_deposit, v_commission, v_details);
  return jsonb_build_object('code', v_code, 'status', v_status, 'total', v_total, 'deposit', v_deposit);
end $$;
grant execute on function public.create_booking(jsonb) to anon, authenticated;

-- El cliente consulta su reserva con el código y su teléfono.
create or replace function public.get_my_booking(p_code text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(b) from bookings b
  where b.code = p_code and right(regexp_replace(b.customer_phone, '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
$$;
grant execute on function public.get_my_booking(text, text) to anon, authenticated;

-- El cliente puede cancelar su propia reserva si todavía está pendiente.
create or replace function public.cancel_my_booking(p_code text, p_phone text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update bookings set status = 'cancelled'
  where code = p_code and status in ('pending','quote')
    and right(regexp_replace(customer_phone, '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8);
  return found;
end $$;
grant execute on function public.cancel_my_booking(text, text) to anon, authenticated;

-- Ocupación de un día (sin datos personales) para calcular cupos y vehículos libres.
drop function if exists public.day_load(date);
create or replace function public.day_load(p_date date) returns table (kind text, tour_id text, vehicle_type text, slot text, people int, state text)
language sql stable security definer set search_path = public as $$
  select b.type, b.details->>'tourId', b.vehicle_type, b."time",
         coalesce((b.details->>'adults')::int, 0) + coalesce((b.details->>'kids')::int, 0) + coalesce((b.details->>'pax')::int, 0),
         b.status
  from public.bookings b where b.date = p_date and b.status <> 'cancelled'
$$;
grant execute on function public.day_load(date) to anon, authenticated;

-- ========== Opiniones de clientes ==========
-- Solo quien hizo una reserva (con su código y teléfono) puede opinar; el dueño las aprueba antes de publicarlas.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_code text unique not null,
  type text,
  tour_id text,
  name text,
  rating int not null check (rating between 1 and 5),
  comment text,
  lang text,
  approved boolean not null default false,
  created_at timestamptz default now()
);
alter table public.reviews enable row level security;
drop policy if exists "ver opiniones aprobadas" on reviews;
create policy "ver opiniones aprobadas" on reviews for select using (approved or public.is_admin());
drop policy if exists "admin modera opiniones" on reviews;
create policy "admin modera opiniones" on reviews for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.submit_review(p_code text, p_phone text, p_rating int, p_comment text, p_lang text) returns boolean
language plpgsql security definer set search_path = public as $$
declare r_code text; r_type text; r_tour text; r_name text;
begin
  select bk.code, bk.type, bk.details->>'tourId', split_part(trim(bk.customer_name), ' ', 1)
    into r_code, r_type, r_tour, r_name
  from bookings bk
  where bk.code = p_code
    and right(regexp_replace(bk.customer_phone, '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
    and (bk.status = 'completed' or (bk.status = 'paid' and bk.date <= current_date));
  if r_code is null then raise exception 'Solo se puede opinar de una reserva ya realizada'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Calificación no válida'; end if;
  insert into reviews (booking_code, type, tour_id, name, rating, comment, lang)
  values (r_code, r_type, r_tour, r_name, p_rating, left(coalesce(p_comment, ''), 600), p_lang)
  on conflict (booking_code) do update set rating = excluded.rating, comment = excluded.comment, approved = false, created_at = now();
  return true;
end $$;
grant execute on function public.submit_review(text, text, int, text, text) to anon, authenticated;

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
grant select on public.reviews to anon, authenticated;
grant update, delete on public.reviews to authenticated;

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

-- ========== Comprobantes de SINPE ==========
-- El cliente sube la foto del comprobante; solo la administración la puede ver.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "clientes suben comprobantes" on storage.objects;
create policy "clientes suben comprobantes" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'receipts' and name ~ '^TR-[0-9]{5}/[A-Za-z0-9._-]{1,80}$');
drop policy if exists "admin ve comprobantes" on storage.objects;
create policy "admin ve comprobantes" on storage.objects for select using (bucket_id = 'receipts' and public.is_admin());

-- Une el comprobante subido con la reserva (con el código y el teléfono del cliente).
create or replace function public.attach_receipt(p_code text, p_phone text, p_path text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_path is null or left(p_path, length(p_code) + 1) <> p_code || '/' or p_path !~ '^TR-[0-9]{5}/[A-Za-z0-9._-]{1,80}$' then
    raise exception 'Archivo no válido';
  end if;
  update bookings set details = coalesce(details, '{}'::jsonb) || jsonb_build_object('receipt', p_path, 'receiptAt', now())
  where code = p_code and status in ('pending', 'quote')
    and right(regexp_replace(customer_phone, '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8);
  return found;
end $$;
grant execute on function public.attach_receipt(text, text, text) to anon, authenticated;

-- ========== Seguridad (2026-11-21): copia de supabase/seguridad.sql ==========
-- TourRide CR · Ajustes de seguridad (2026-11-21)
-- Pegar completo en Supabase → SQL Editor → Run. Se puede correr más de una vez.

-- 1) Cupones privados: ya no se ven en los datos públicos; la app los valida con check_coupon().
insert into app_data (key, data, is_public)
select 'coupons', coalesce(data->'coupons', '{}'::jsonb), false from app_data where key = 'settings'
on conflict (key) do nothing;
update app_data set data = data - 'coupons' - 'adminPin', updated_at = now() where key = 'settings';

create or replace function public.coupon_pct(p_code text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((
    coalesce((select data from app_data where key = 'coupons'), (select data->'coupons' from app_data where key = 'settings'), '{}'::jsonb)
    ->> upper(trim(coalesce(p_code, '')))
  )::numeric, 0)
$$;
revoke execute on function public.coupon_pct(text) from public, anon, authenticated;

create or replace function public.check_coupon(p_code text) returns numeric
language sql stable security definer set search_path = public as $$
  select case when length(coalesce(p_code, '')) between 3 and 30 then public.coupon_pct(p_code) else 0 end
$$;
grant execute on function public.check_coupon(text) to anon, authenticated;

-- 2) Crear reserva: solo se guardan los datos esperados, con largo máximo, y con límite de reservas.
create or replace function public.create_booking(b jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_st jsonb := coalesce((select data from app_data where key = 'settings'), '{}'::jsonb);
  v_tour jsonb; v_rate jsonb; v_partner jsonb;
  v_type text := b->>'type';
  v_date date := (b->>'date')::date;
  v_time text := left(coalesce(b->>'time', ''), 5);
  v_name text := left(trim(coalesce(b->'customer'->>'name', '')), 80);
  v_phone_raw text := left(coalesce(b->'customer'->>'phone', ''), 30);
  v_email text := left(trim(coalesce(b->'customer'->>'email', '')), 120);
  v_phone text := regexp_replace(left(coalesce(b->'customer'->>'phone', ''), 30), '\D', '', 'g');
  v_vehicle text := left(coalesce(b->>'vehicleId', ''), 20);
  v_status text := 'pending';
  v_adults int := least(greatest(coalesce((b->>'adults')::int, 0), 0), 99);
  v_kids int := least(greatest(coalesce((b->>'kids')::int, 0), 0), 99);
  v_pax int := least(greatest(coalesce((b->>'pax')::int, 0), 0), 99);
  v_bags int := least(greatest(coalesce((b->>'bags')::int, 0), 0), 99);
  v_people int; v_used int; v_pct numeric; v_coupon text := '';
  v_tour_amount numeric := 0; v_discount numeric := 0; v_pickup_amount numeric := 0;
  v_unit numeric := 0; v_total numeric := 0; v_deposit numeric := 0; v_commission numeric := 0;
  v_dup text; v_details jsonb;
begin
  if v_name = '' or length(v_phone) < 8 then raise exception 'Faltan nombre o teléfono'; end if;
  if v_date is null or v_date < current_date - 1 or v_date > current_date + 730 then raise exception 'Fecha no válida'; end if;
  if v_type not in ('tour', 'transfer') then raise exception 'Tipo no válido'; end if;
  if v_time !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'Hora no válida'; end if;
  if v_email <> '' and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_email := ''; end if;

  -- doble clic: la misma reserva en los últimos 10 minutos devuelve el mismo código
  select bk.code into v_dup from bookings bk
  where bk.type = v_type and bk.date = v_date and bk.time = v_time and bk.status <> 'cancelled'
    and right(regexp_replace(bk.customer_phone, '\D', '', 'g'), 8) = right(v_phone, 8)
    and coalesce(bk.details->>'tourId', '') = coalesce(b->>'tourId', '')
    and coalesce(bk.details->>'from', '') = coalesce(b->>'from', '') and coalesce(bk.details->>'to', '') = coalesce(b->>'to', '')
    and bk.created_at > now() - interval '10 minutes'
  limit 1;
  if v_dup is not null then
    return (select jsonb_build_object('code', bk.code, 'status', bk.status, 'total', bk.total, 'deposit', bk.deposit) from bookings bk where bk.code = v_dup);
  end if;

  -- límites contra reservas falsas en cantidad
  if (select count(*) from bookings bk where bk.created_at > now() - interval '24 hours'
        and right(regexp_replace(bk.customer_phone, '\D', '', 'g'), 8) = right(v_phone, 8)) >= 10 then
    raise exception 'Demasiadas reservas con este teléfono hoy. Escríbenos por WhatsApp.';
  end if;
  if (select count(*) from bookings bk where bk.created_at > now() - interval '1 hour') >= 120 then
    raise exception 'Hay muchas reservas en este momento. Intenta en unos minutos o escríbenos por WhatsApp.';
  end if;

  if v_type = 'tour' then
    select t into v_tour from jsonb_array_elements(coalesce((select data from app_data where key = 'tours'), '[]'::jsonb)) t
      where t->>'id' = b->>'tourId' and coalesce((t->>'active')::boolean, true);
    if v_tour is null then raise exception 'Tour no disponible'; end if;
    if not (v_tour->'schedules') ? v_time then raise exception 'Horario no válido'; end if;
    v_people := v_adults + v_kids;
    if v_adults < 1 or v_people > 60 then raise exception 'Cantidad de personas no válida'; end if;
    select coalesce(sum(coalesce((bk.details->>'adults')::int, 0) + coalesce((bk.details->>'kids')::int, 0)), 0) into v_used
      from bookings bk
      where bk.type = 'tour' and bk.details->>'tourId' = v_tour->>'id' and bk.date = v_date and bk.time = v_time and bk.status <> 'cancelled';
    if v_used + v_people > coalesce((v_tour->>'capacity')::int, 999) then raise exception 'No hay cupos suficientes'; end if;
    if coalesce((v_st->>'highSeason')::boolean, false) then
      v_tour_amount := v_adults * coalesce(nullif(v_tour->>'highAdult', '')::numeric, (v_tour->>'priceAdult')::numeric)
                   + v_kids * coalesce(nullif(v_tour->>'highChild', '')::numeric, (v_tour->>'priceChild')::numeric);
    else
      v_tour_amount := v_adults * (v_tour->>'priceAdult')::numeric + v_kids * (v_tour->>'priceChild')::numeric;
    end if;
    v_pct := public.coupon_pct(left(coalesce(b->>'coupon', ''), 30));
    if v_pct > 0 then v_coupon := upper(trim(b->>'coupon')); end if;
    v_discount := round(v_tour_amount * least(v_pct, 100) / 100);
    if coalesce((b->>'pickup')::boolean, false) then
      v_pickup_amount := v_people * coalesce((v_st->>'hotelPickupPerPerson')::numeric, 0);
    end if;
    v_total := v_tour_amount - v_discount + v_pickup_amount;
    select p into v_partner from jsonb_array_elements(coalesce((select data from app_data where key = 'partners'), '[]'::jsonb)) p
      where p->>'id' = v_tour->>'partnerId';
    v_commission := round((v_tour_amount - v_discount) * coalesce((v_partner->>'commission')::numeric, 0) / 100);
  else
    if v_pax < 1 or v_pax > 60 then raise exception 'Cantidad de pasajeros no válida'; end if;
    select r into v_rate from jsonb_array_elements(coalesce((select data from app_data where key = 'rates'), '[]'::jsonb)) r
      where (r->>'from' = b->>'from' and r->>'to' = b->>'to') or (r->>'from' = b->>'to' and r->>'to' = b->>'from')
      limit 1;
    if v_vehicle !~ '^[a-z0-9]{2,20}$' then raise exception 'Vehículo no válido'; end if;
    v_unit := coalesce(nullif(v_rate->>v_vehicle, '')::numeric, 0);
    if v_unit <= 0 then
      v_status := 'quote';   -- sin tarifa: el dueño cotiza
    elsif v_vehicle in ('shuttle', 'boat') then
      v_total := v_unit * v_pax;
    else
      v_total := v_unit;
    end if;
  end if;
  v_deposit := round(v_total * coalesce((v_st->>'depositPct')::numeric, 0) / 100);

  loop
    v_code := 'TR-' || (10000 + floor(random() * 90000))::int;
    exit when not exists (select 1 from bookings bk where bk.code = v_code);
  end loop;

  -- solo los datos que la app usa, cada uno con largo máximo (lo demás que mande el navegador se ignora)
  v_details := jsonb_strip_nulls(jsonb_build_object(
    'type', v_type, 'date', v_date, 'time', v_time, 'createdAt', now(),
    'payment', case when b->>'payment' in ('sinpe', 'cash', 'card') then b->>'payment' end,
    'customer', jsonb_build_object('name', v_name, 'phone', v_phone_raw, 'email', v_email),
    'notes', left(coalesce(b->>'notes', ''), 300),
    'code', v_code, 'status', v_status, 'total', v_total, 'deposit', v_deposit, 'commission', v_commission));
  if v_type = 'tour' then
    v_details := v_details || jsonb_build_object(
      'tourId', v_tour->>'id', 'tourName', v_tour->'name', 'partnerId', v_tour->>'partnerId', 'location', v_tour->>'location',
      'adults', v_adults, 'kids', v_kids, 'pickup', coalesce((b->>'pickup')::boolean, false),
      'hotel', left(coalesce(b->>'hotel', ''), 120), 'coupon', v_coupon,
      'tourAmount', v_tour_amount, 'discount', v_discount, 'pickupAmount', v_pickup_amount);
  else
    v_details := v_details || jsonb_build_object(
      'from', left(coalesce(b->>'from', ''), 120), 'to', left(coalesce(b->>'to', ''), 120),
      'flight', left(coalesce(b->>'flight', ''), 20), 'pax', v_pax, 'bags', v_bags, 'vehicleId', v_vehicle, 'unit', v_unit);
  end if;

  insert into bookings (code, type, status, date, time, partner_id, vehicle_type, customer_name, customer_phone,
                        customer_email, total, deposit, commission, details)
  values (v_code, v_type, v_status, v_date, v_time, v_details->>'partnerId', nullif(v_vehicle, ''),
          v_name, v_phone_raw, nullif(v_email, ''), v_total, v_deposit, v_commission, v_details);
  return jsonb_build_object('code', v_code, 'status', v_status, 'total', v_total, 'deposit', v_deposit);
end $$;
grant execute on function public.create_booking(jsonb) to anon, authenticated;

-- 3) El cliente que consulta su reserva ya no ve datos internos (comisión, chofer, unidad, socio).
create or replace function public.get_my_booking(p_code text, p_phone text) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(b) - 'commission' - 'driver_id' - 'unit_id' - 'partner_id')
         || jsonb_build_object('commission', 0, 'details', coalesce(b.details, '{}'::jsonb) - 'commission' - 'partnerId' - 'unit')
  from bookings b
  where b.code = upper(trim(p_code)) and length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) >= 8
    and right(regexp_replace(b.customer_phone, '\D', '', 'g'), 8) = right(regexp_replace(p_phone, '\D', '', 'g'), 8)
$$;
grant execute on function public.get_my_booking(text, text) to anon, authenticated;

-- 4) Comprobantes: solo se pueden subir para una reserva que existe y está pendiente.
create or replace function public.booking_open(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings where code = p_code and status in ('pending', 'quote'))
$$;
grant execute on function public.booking_open(text) to anon, authenticated;
drop policy if exists "clientes suben comprobantes" on storage.objects;
create policy "clientes suben comprobantes" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'receipts' and name ~ '^TR-[0-9]{5}/[A-Za-z0-9._-]{1,80}$' and public.booking_open(split_part(name, '/', 1)));
