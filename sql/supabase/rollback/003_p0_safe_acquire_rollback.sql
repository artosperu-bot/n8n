-- P0 Safe Acquire rollback — exact production baseline captured before promotion on 2026-08-12.
-- Cause: restore the real pre-promotion ia_adquirir_turno overloads.
-- Baseline hashes:
--   ia_adquirir_turno(text,text,integer,integer,text) = 0ee9ff897d08236b61c563fdf441c1fa
--   ia_adquirir_turno(text,text,integer,integer)      = c78614e3bfa80cafe7abace68139717d
-- Owner: postgres
-- Grants: postgres EXECUTE, service_role EXECUTE

CREATE OR REPLACE FUNCTION public.ia_adquirir_turno(p_session_id text, p_owner text, p_ttl_seconds integer, p_wait_seconds integer, p_message_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
 SET statement_timeout TO '55s'
AS $function$
declare
  v_started_at timestamptz := clock_timestamp();
  v_acquired boolean;
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds, 120), 300));
  v_wait integer := greatest(0, least(coalesce(p_wait_seconds, 45), 50));
  v_session text := nullif(btrim(p_session_id), '');
  v_owner text := nullif(btrim(p_owner), '');
  v_message text := nullif(btrim(p_message_id), '');
  v_head_message text;
  v_head_owner text;
  v_head_ready boolean;
  v_expired_owner text;
  v_settle interval := make_interval(secs => 0.8);
begin
  if v_session is null or v_owner is null or v_message is null then
    raise exception using errcode = '22023', message = 'SESSION_OWNER_MESSAGE_REQUIRED';
  end if;

  insert into public.ia_turn_queue (session_id, message_id, owner, status, enqueued_at)
  values (v_session, v_message, v_owner, 'PENDING', clock_timestamp())
  on conflict (message_id) do update
    set owner = coalesce(public.ia_turn_queue.owner, excluded.owner),
        updated_at = clock_timestamp();

  loop
    v_expired_owner := null;

    delete from public.ia_session_locks as l
    where l.session_id = v_session
      and l.locked_until <= clock_timestamp()
    returning l.owner into v_expired_owner;

    if v_expired_owner is not null then
      update public.ia_turn_queue
         set status = 'FAILED',
             finished_at = clock_timestamp(),
             updated_at = clock_timestamp(),
             last_error = 'LOCK_EXPIRED'
       where session_id = v_session
         and owner = v_expired_owner
         and status = 'PROCESSING';
    end if;

    update public.ia_turn_queue
       set status = 'FAILED',
           finished_at = clock_timestamp(),
           updated_at = clock_timestamp(),
           last_error = 'QUEUE_WAIT_EXPIRED'
     where session_id = v_session
       and status = 'PENDING'
       and enqueued_at < clock_timestamp() - interval '5 minutes';

    select
      q.message_id,
      q.owner,
      (q.status = 'PROCESSING' or q.enqueued_at <= clock_timestamp() - v_settle)
      into v_head_message, v_head_owner, v_head_ready
      from public.ia_turn_queue as q
     where q.session_id = v_session
       and q.status in ('PENDING','PROCESSING')
     order by
       coalesce(q.source_sent_at, q.enqueued_at),
       q.source_sequence nulls last,
       q.enqueued_at,
       q.id
     limit 1;

    if (v_head_message is null or v_head_message = v_message)
       and coalesce(v_head_ready, true) then
      v_acquired := false;

      insert into public.ia_session_locks as l
        (session_id, owner, locked_until, updated_at)
      values
        (v_session, v_owner, clock_timestamp() + make_interval(secs => v_ttl), clock_timestamp())
      on conflict (session_id) do update
        set owner = excluded.owner,
            locked_until = excluded.locked_until,
            updated_at = excluded.updated_at
        where l.locked_until <= clock_timestamp()
           or l.owner = excluded.owner
      returning true into v_acquired;

      if coalesce(v_acquired, false) then
        update public.ia_turn_queue
           set owner = v_owner,
               status = 'PROCESSING',
               started_at = coalesce(started_at, clock_timestamp()),
               attempts = attempts + 1,
               updated_at = clock_timestamp(),
               last_error = null
         where message_id = v_message
           and session_id = v_session;

        return jsonb_build_object(
          'ok', true,
          'session_id', v_session,
          'message_id', v_message,
          'owner', v_owner,
          'queue_head', true,
          'source_ordered', true,
          'locked_until', clock_timestamp() + make_interval(secs => v_ttl)
        );
      end if;
    end if;

    if extract(epoch from (clock_timestamp() - v_started_at)) >= v_wait then
      update public.ia_turn_queue
         set last_error = 'SESSION_BUSY',
             updated_at = clock_timestamp()
       where message_id = v_message
         and session_id = v_session;
      raise exception using
        errcode = '55P03',
        message = format('SESSION_BUSY head=%s current=%s', coalesce(v_head_message,'NONE'), v_message);
    end if;

    perform pg_sleep(0.20);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ia_adquirir_turno(p_session_id text, p_owner text, p_ttl_seconds integer DEFAULT 180, p_wait_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_started_at timestamptz := clock_timestamp();
  v_acquired boolean;
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds, 180), 300));
  v_wait integer := greatest(0, least(coalesce(p_wait_seconds, 60), 90));
begin
  if nullif(btrim(p_session_id), '') is null or nullif(btrim(p_owner), '') is null then
    raise exception using errcode = '22023', message = 'SESSION_AND_OWNER_REQUIRED';
  end if;

  loop
    v_acquired := false;

    insert into public.ia_session_locks as l
      (session_id, owner, locked_until, updated_at)
    values
      (btrim(p_session_id), btrim(p_owner), clock_timestamp() + make_interval(secs => v_ttl), clock_timestamp())
    on conflict (session_id) do update
      set owner = excluded.owner,
          locked_until = excluded.locked_until,
          updated_at = excluded.updated_at
      where l.locked_until <= clock_timestamp()
         or l.owner = excluded.owner
    returning true into v_acquired;

    if coalesce(v_acquired, false) then
      return jsonb_build_object(
        'ok', true,
        'session_id', btrim(p_session_id),
        'owner', btrim(p_owner),
        'locked_until', clock_timestamp() + make_interval(secs => v_ttl)
      );
    end if;

    if extract(epoch from (clock_timestamp() - v_started_at)) >= v_wait then
      raise exception using errcode = '55P03', message = 'SESSION_BUSY';
    end if;

    perform pg_sleep(0.25);
  end loop;
end;
$function$;

ALTER FUNCTION public.ia_adquirir_turno(text,text,integer,integer,text) OWNER TO postgres;
ALTER FUNCTION public.ia_adquirir_turno(text,text,integer,integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.ia_adquirir_turno(text,text,integer,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ia_adquirir_turno(text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_adquirir_turno(text,text,integer,integer,text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.ia_adquirir_turno(text,text,integer,integer) TO postgres, service_role;
