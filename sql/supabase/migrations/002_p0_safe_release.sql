-- P0 Script C — safe release.
-- Apply only after QA candidate passes and exact rollback baseline is captured.

create or replace function public.ia_liberar_turno(
  p_session_id text,
  p_owner text,
  p_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz;
  v_lock public.ia_session_locks%rowtype;
  v_queue public.ia_turn_queue%rowtype;
begin
  if nullif(btrim(p_session_id), '') is null
     or nullif(btrim(p_owner), '') is null
     or nullif(btrim(p_message_id), '') is null then
    return jsonb_build_object('ok', false, 'released', false, 'reason', 'MISSING_KEYS');
  end if;

  select * into v_lock
    from public.ia_session_locks
   where session_id = btrim(p_session_id)
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'LOCK_NOT_FOUND');
  end if;

  if v_lock.owner is distinct from btrim(p_owner) then
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'OWNER_MISMATCH');
  end if;

  select * into v_queue
    from public.ia_turn_queue
   where session_id = btrim(p_session_id)
     and message_id = btrim(p_message_id)
   for update;

  if not found then
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'QUEUE_NOT_FOUND');
  end if;

  if v_queue.owner is distinct from btrim(p_owner) then
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'QUEUE_OWNER_MISMATCH');
  end if;

  if upper(coalesce(v_queue.status, '')) <> 'PROCESSING' then
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'QUEUE_NOT_PROCESSING');
  end if;

  -- Effective time is intentionally captured only after both potentially
  -- blocking reads. This prevents a stale timestamp from authorizing release.
  v_now := clock_timestamp();

  if v_lock.locked_until is null or v_lock.locked_until <= v_now then
    return jsonb_build_object('ok', true, 'released', false, 'reason', 'LEASE_EXPIRED');
  end if;

  update public.ia_turn_queue
     set status = 'DONE',
         finished_at = v_now,
         updated_at = v_now,
         last_error = null
   where session_id = btrim(p_session_id)
     and message_id = btrim(p_message_id)
     and owner = btrim(p_owner)
     and upper(coalesce(status, '')) = 'PROCESSING';

  if not found then
    raise exception 'SAFE_RELEASE_QUEUE_STATE_CHANGED';
  end if;

  delete from public.ia_session_locks
   where session_id = btrim(p_session_id)
     and owner = btrim(p_owner);

  if not found then
    raise exception 'SAFE_RELEASE_LOCK_CHANGED';
  end if;

  return jsonb_build_object(
    'ok', true,
    'released', true,
    'reason', 'OK',
    'session_id', btrim(p_session_id),
    'message_id', btrim(p_message_id),
    'owner', btrim(p_owner),
    'finished_at', v_now
  );
end;
$$;

-- Legacy overload is deliberately fail-closed: without message_id an exact
-- queue row cannot be fenced safely.
create or replace function public.ia_liberar_turno(
  p_session_id text,
  p_owner text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_session_id), '') is null
     or nullif(btrim(p_owner), '') is null then
    return jsonb_build_object('ok', false, 'released', false, 'reason', 'MISSING_KEYS');
  end if;

  return jsonb_build_object(
    'ok', true,
    'released', false,
    'reason', 'MESSAGE_ID_REQUIRED',
    'session_id', btrim(p_session_id)
  );
end;
$$;

alter function public.ia_liberar_turno(text,text,text) owner to postgres;
alter function public.ia_liberar_turno(text,text) owner to postgres;

revoke all on function public.ia_liberar_turno(text,text,text) from public, anon, authenticated;
revoke all on function public.ia_liberar_turno(text,text) from public, anon, authenticated;
grant execute on function public.ia_liberar_turno(text,text,text) to postgres, service_role;
grant execute on function public.ia_liberar_turno(text,text) to postgres, service_role;
