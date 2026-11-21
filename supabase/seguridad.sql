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
