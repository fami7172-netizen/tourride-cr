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
