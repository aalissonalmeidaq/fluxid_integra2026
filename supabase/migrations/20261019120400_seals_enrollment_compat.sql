-- Spec 013, US2: lacres da Spec 012 cadastrados à mão (research.md, item 12; RF-018; RN-006). Cada linha ativa ganha um pedido
-- approved, com o último tenant preenchido, para aparecer ao Master como "em operação" e seguir a regra das redes. A chave continua a
-- mesma, então o lacre segue recebendo 200. A aprovação fica com a data do cadastro e sem Master (origem "cadastro manual").

create function private.seal_enrollment_backfill() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_device public.seal_devices;
  v_enrollment uuid;
  v_count integer := 0;
begin
  for v_device in
    select d.* from public.seal_devices d
     where d.status = 'active' and d.enrollment_id is null
       and not exists (select 1 from public.seal_enrollments e where e.device_code = d.device_code)
     order by d.created_at, d.id
  loop
    insert into public.seal_enrollments (device_code, key_hash, status, organization_id, device_id, last_organization_id,
      first_seen_at, last_seen_at, firmware_version, decided_at)
    values (v_device.device_code, v_device.key_hash, 'approved', v_device.organization_id, v_device.id, v_device.organization_id,
      v_device.created_at, coalesce(v_device.last_seen_at, v_device.created_at), left(v_device.firmware_version, 32), v_device.created_at)
    returning id into v_enrollment;
    update public.seal_devices set enrollment_id = v_enrollment, approved_at = created_at where id = v_device.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

select private.seal_enrollment_backfill();

revoke all on function private.seal_enrollment_backfill() from public, anon, authenticated;
