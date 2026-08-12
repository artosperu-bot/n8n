-- PREPARED ONLY — DO NOT APPLY WITHOUT AUDITOR APPROVAL.
-- P0: owner-fenced lease renewal that cannot revive an expired lease
-- and cannot shorten an active lease.
-- Assumes observed schema:
--   public.ia_session_locks(session_id, owner, locked_until, updated_at)
--   public.ia_turn_queue(session_id, message_id, owner, status, ...)
-- Pre-apply requirement: confirm exact column types and function grants in production.

create or replace function public.ia_renovar_turno(
  p_session_id text,
  p_owner text,
  p_message_id text,
  p_ttl_seconds integer default 120
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_ttl_seconds integer;
  v_lock public.ia_session_locks%rowtype;
  v_queue public.ia_turn_queue%rowtype;
  v_new_locked_until timestamptz;
begin
  if nullif(btrim(p_session_id), '') is null
     or nullif(btrim(p_owner), '') is null
     or nullif(btrim(p_message_id), '') is null then
    return jsonb_build_object('renewed', false, 'reason', 'INVALID_ARGUMENT');
  end if;

  v_ttl_seconds := greatest(30, least(coalesce(p_ttl_seconds, 120), 300));

  select * into v_lock
  from public.ia_session_locks
  where session_id = p_session_id
  for update;

  if not found then
    return jsonb_build_object('renewed', false, 'reason', 'LOCK_NOT_FOUND');
  end if;

  if v_lock.owner is distinct from p_owner then
    return jsonb_build_object('renewed', false, 'reason', 'OWNER_MISMATCH');
  end if;

  if v_lock.locked_until is null or v_lock.locked_until <= v_now then
    return jsonb_build_object('renewed', false, 'reason', 'LEASE_EXPIRED');
  end if;

  select * into v_queue
  from public.ia_turn_queue
  where session_id = p_session_id
    and message_id = p_message_id
  for update;

  if not found then
    return jsonb_build_object('renewed', false, 'reason', 'QUEUE_NOT_FOUND');
  end if;

  if v_queue.owner is distinct from p_owner then
    return jsonb_build_object('renewed', false, 'reason', 'QUEUE_OWNER_MISMATCH');
  end if;

  if upper(coalesce(v_queue.status, '')) <> 'PROCESSING' then
    return jsonb_build_object('renewed', false, 'reason', 'QUEUE_NOT_PROCESSING');
  end if;

  v_new_locked_until := greatest(
    v_lock.locked_until,
    v_now + make_interval(secs => v_ttl_seconds)
  );

  update public.ia_session_locks
  set locked_until = v_new_locked_until,
      updated_at = v_now
  where session_id = p_session_id
    and owner = p_owner;

  return jsonb_build_object(
    'renewed', true,
    'reason', 'OK',
    'session_id', p_session_id,
    'message_id', p_message_id,
    'owner', p_owner,
    'locked_until', v_new_locked_until,
    'ttl_seconds', v_ttl_seconds
  );
end;
$$;

-- Grants are intentionally NOT included here.
-- Before apply, reproduce the existing RPC execution policy explicitly after audit.
