-- PREPARED ONLY — DO NOT APPLY WITHOUT AUDITOR APPROVAL.
-- P0: atomic owner/message/lease-fenced release.
-- IMPORTANT: before applying, capture the current production definition with
-- pg_get_functiondef so rollback/privileges can be restored exactly.
-- Assumes existing signature: public.ia_liberar_turno(text,text,text).

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
    return jsonb_build_object('released', false, 'reason', 'INVALID_ARGUMENT');
  end if;

  -- Serialize release against renew/acquire operations for this session.
  select *
    into v_lock
    from public.ia_session_locks
   where session_id = p_session_id
   for update;

  if not found then
    return jsonb_build_object('released', false, 'reason', 'LOCK_NOT_FOUND');
  end if;

  if v_lock.owner is distinct from p_owner then
    return jsonb_build_object('released', false, 'reason', 'OWNER_MISMATCH');
  end if;

  select *
    into v_queue
    from public.ia_turn_queue
   where session_id = p_session_id
     and message_id = p_message_id
   for update;

  if not found then
    return jsonb_build_object('released', false, 'reason', 'QUEUE_NOT_FOUND');
  end if;

  if v_queue.owner is distinct from p_owner then
    return jsonb_build_object('released', false, 'reason', 'QUEUE_OWNER_MISMATCH');
  end if;

  if upper(coalesce(v_queue.status, '')) <> 'PROCESSING' then
    return jsonb_build_object('released', false, 'reason', 'QUEUE_NOT_PROCESSING');
  end if;

  -- Critical P0 rule: take the effective time only after all blocking reads.
  -- If this worker waited on either FOR UPDATE, it must validate the lease
  -- against the current clock immediately before finalizing queue state.
  v_now := clock_timestamp();

  if v_lock.locked_until is null or v_lock.locked_until <= v_now then
    return jsonb_build_object('released', false, 'reason', 'LEASE_EXPIRED');
  end if;

  update public.ia_turn_queue
     set status = 'DONE',
         finished_at = v_now,
         updated_at = v_now
   where session_id = p_session_id
     and message_id = p_message_id
     and owner = p_owner
     and upper(coalesce(status, '')) = 'PROCESSING';

  if not found then
    raise exception 'SAFE_RELEASE_QUEUE_STATE_CHANGED';
  end if;

  delete from public.ia_session_locks
   where session_id = p_session_id
     and owner = p_owner;

  if not found then
    raise exception 'SAFE_RELEASE_LOCK_CHANGED';
  end if;

  return jsonb_build_object(
    'released', true,
    'reason', 'OK',
    'session_id', p_session_id,
    'message_id', p_message_id,
    'owner', p_owner,
    'finished_at', v_now
  );
end;
$$;

-- Grants are intentionally NOT included here.
-- Before apply, reproduce the current RPC grants/ownership after audit.
