-- TourRide CR · Datos de demostración para el comprador
-- Pegar completo en Supabase → SQL Editor → Run. Se puede correr más de una vez sin duplicar.
-- ANTES: crear el usuario en Authentication → Users → Add user → Create new user
--        (correo de abajo, una contraseña de al menos 6 caracteres y marcar "Auto Confirm User").

-- 1) Cuenta del comprador con rol "Dueño del negocio" (ve todo menos lo de súper administrador)
update public.profiles
   set role = 'owner', full_name = 'Comprador (demo)'
 where email = 'comprador@tourride-demo.com';

-- 2) Tres reservas de ejemplo (los precios y nombres salen de los tours guardados en la base)
do $$
declare
  v_tours jsonb   := coalesce((select data from app_data where key = 'tours'), '[]'::jsonb);
  v_partners jsonb := coalesce((select data from app_data where key = 'partners'), '[]'::jsonb);
  v_st jsonb      := coalesce((select data from app_data where key = 'settings'), '{}'::jsonb);
  v_driver text   := (select d->>'id' from jsonb_array_elements(coalesce((select data from app_data where key = 'drivers'), '[]'::jsonb)) d limit 1);
  v_unit text     := (select u->>'id' from jsonb_array_elements(coalesce((select data from app_data where key = 'fleet'), '[]'::jsonb)) u where u->>'typeId' = 'van6' limit 1);
  t1 jsonb; t3 jsonb; pct1 numeric; pct3 numeric; pick numeric;
  a1 numeric; a3 numeric;
begin
  select t into t1 from jsonb_array_elements(v_tours) t where t->>'id' = 't1';
  select t into t3 from jsonb_array_elements(v_tours) t where t->>'id' = 't3';
  pick := coalesce((v_st->>'hotelPickupPerPerson')::numeric, 0);
  pct1 := coalesce((select (p->>'commission')::numeric from jsonb_array_elements(v_partners) p where p->>'id' = t1->>'partnerId'), 0);
  pct3 := coalesce((select (p->>'commission')::numeric from jsonb_array_elements(v_partners) p where p->>'id' = t3->>'partnerId'), 0);

  -- A) Traslado aeropuerto SJO → La Fortuna, pagado, con chofer y buseta asignados (en 3 días)
  insert into bookings (code, type, status, date, time, vehicle_type, unit_id, driver_id,
                        customer_name, customer_phone, customer_email, total, deposit, commission, details)
  values ('TR-10001', 'transfer', 'paid', current_date + 3, '10:30', 'van6', v_unit, v_driver,
          'Emily Johnson', '+1 512 555 0142', 'emily@example.com', 95, 0, 0,
          jsonb_build_object('demo', true, 'payment', 'cash', 'from', 'Aeropuerto SJO', 'to', 'La Fortuna',
                             'flight', 'UA 1523', 'pax', 4, 'bags', 4, 'vehicleId', 'van6',
                             'notes', 'Viajamos con un niño de 3 años, necesitamos silla.'))
  on conflict (code) do nothing;

  -- B) Tour Volcán Arenal, 2 adultos + 1 niño con recogida en hotel, pendiente (en 5 días)
  if t1 is not null then
    a1 := 2 * (t1->>'priceAdult')::numeric + 1 * (t1->>'priceChild')::numeric;
    insert into bookings (code, type, status, date, time, partner_id,
                          customer_name, customer_phone, customer_email, total, deposit, commission, details)
    values ('TR-10002', 'tour', 'pending', current_date + 5, coalesce(t1->'schedules'->>1, t1->'schedules'->>0), t1->>'partnerId',
            'Lucas Martin', '+33 6 00 00 00 21', '', a1 + 3 * pick, 0, round(a1 * pct1 / 100),
            jsonb_build_object('demo', true, 'payment', 'sinpe', 'tourId', 't1', 'tourName', t1->'name', 'location', t1->>'location',
                               'partnerId', t1->>'partnerId', 'adults', 2, 'kids', 1, 'pickup', true, 'hotel', 'Hotel en La Fortuna (ejemplo)',
                               'tourAmount', a1, 'discount', 0, 'pickupAmount', 3 * pick, 'notes', ''))
    on conflict (code) do nothing;
  end if;

  -- C) Tour de perezosos en Monteverde, 2 adultos, completado hace 2 días (sirve para mostrar opiniones)
  if t3 is not null then
    a3 := 2 * (t3->>'priceAdult')::numeric;
    insert into bookings (code, type, status, date, time, partner_id,
                          customer_name, customer_phone, customer_email, total, deposit, commission, details)
    values ('TR-10003', 'tour', 'completed', current_date - 2, coalesce(t3->'schedules'->>2, t3->'schedules'->>0), t3->>'partnerId',
            'Mariana Rojas', '+506 8000 0003', 'mariana@example.com', a3, 0, round(a3 * pct3 / 100),
            jsonb_build_object('demo', true, 'payment', 'sinpe', 'tourId', 't3', 'tourName', t3->'name', 'location', t3->>'location',
                               'partnerId', t3->>'partnerId', 'adults', 2, 'kids', 0, 'pickup', false, 'hotel', '',
                               'tourAmount', a3, 'discount', 0, 'pickupAmount', 0, 'notes', 'Celebramos aniversario.'))
    on conflict (code) do nothing;
  end if;
end $$;

-- 3) Revisar el resultado
select code, type, status, date, time, customer_name, total, commission from bookings where details->>'demo' = 'true' order by date;
select email, role from profiles where email = 'comprador@tourride-demo.com';

-- Para BORRAR los datos de ejemplo después de la presentación:
--   delete from bookings where details->>'demo' = 'true';
--   update profiles set role = 'pending' where email = 'comprador@tourride-demo.com';
