-- P0 Safe Acquire promoted to production on 2026-08-12.
-- Cause: duplicate message acquisition and cross-session phantom acquire.
-- Tests: concurrent QA 7/8 PASS; concurrent production 7/8 PASS; production regression PASS.
-- Result: promoted. Long-duration >120/>180 gates remain open due temporary harness statement_timeout.

CREATE OR REPLACE FUNCTION public.ia_adquirir_turno(
  p_session_id text,
  p_owner text,
  p_ttl_seconds integer,
  p_wait_seconds integer,
  p_message_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
SET statement_timeout TO '55s'
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_acquired boolean;
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds, 120), 300));
  v_wait integer := greatest(0, least(coalesce(p_wait_seconds, 45), 50));
  v_session text := nullif(btrim(p_session_id), '');
  v_owner text := nullif(btrim(p_owner), '');
  v_message text := nullif(btrim(p_message_id), '');
  v_head_message text;
  v_head_ready boolean;
  v_expired_owner text;
  v_existing_session text;
  v_queue_owner text;
  v_queue_status text;
  v_queue_attempts integer;
  v_lock_owner text;
  v_locked_until timestamptz;
  v_settle interval := make_interval(secs => 0.8);
  v_affected integer := 0;
BEGIN
  IF v_session IS NULL OR v_owner IS NULL OR v_message IS NULL THEN
    RAISE EXCEPTION USING errcode = '22023', message = 'SESSION_OWNER_MESSAGE_REQUIRED';
  END IF;

  INSERT INTO public.ia_turn_queue(session_id,message_id,owner,status,enqueued_at)
  VALUES(v_session,v_message,v_owner,'PENDING',clock_timestamp())
  ON CONFLICT(message_id) DO NOTHING;

  SELECT q.session_id INTO v_existing_session
  FROM public.ia_turn_queue q
  WHERE q.message_id = v_message;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAFE_ACQUIRE_MESSAGE_IDENTITY_MISSING';
  END IF;

  IF v_existing_session IS DISTINCT FROM v_session THEN
    RETURN jsonb_build_object(
      'ok',true,'acquired',false,'idempotent',true,
      'reason','MESSAGE_SESSION_MISMATCH',
      'message_id',v_message,
      'requested_session_id',v_session,
      'existing_session_id',v_existing_session
    );
  END IF;

  SELECT l.owner,l.locked_until
  INTO v_lock_owner,v_locked_until
  FROM public.ia_session_locks l
  WHERE l.session_id=v_session
  FOR UPDATE;

  IF FOUND AND v_locked_until <= clock_timestamp() THEN
    DELETE FROM public.ia_session_locks
    WHERE session_id=v_session AND owner=v_lock_owner;

    UPDATE public.ia_turn_queue
    SET status='FAILED',finished_at=clock_timestamp(),updated_at=clock_timestamp(),last_error='LOCK_EXPIRED'
    WHERE session_id=v_session AND owner=v_lock_owner AND status='PROCESSING';

    v_lock_owner:=NULL;
    v_locked_until:=NULL;
  END IF;

  SELECT q.owner,q.status,q.attempts
  INTO v_queue_owner,v_queue_status,v_queue_attempts
  FROM public.ia_turn_queue q
  WHERE q.session_id=v_session AND q.message_id=v_message
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SAFE_ACQUIRE_QUEUE_IDENTITY_CHANGED';
  END IF;

  IF v_queue_status='PROCESSING' THEN
    RETURN jsonb_build_object('ok',true,'acquired',false,'idempotent',true,'reason','ALREADY_PROCESSING','session_id',v_session,'message_id',v_message,'owner',v_queue_owner,'attempts',v_queue_attempts);
  ELSIF v_queue_status='DONE' THEN
    RETURN jsonb_build_object('ok',true,'acquired',false,'idempotent',true,'reason','ALREADY_DONE','session_id',v_session,'message_id',v_message,'attempts',v_queue_attempts);
  ELSIF v_queue_status='FAILED' THEN
    RETURN jsonb_build_object('ok',true,'acquired',false,'idempotent',true,'reason','FAILED_REQUIRES_NEW_MESSAGE_ID','session_id',v_session,'message_id',v_message,'attempts',v_queue_attempts);
  ELSIF v_queue_status IS DISTINCT FROM 'PENDING' THEN
    RAISE EXCEPTION 'SAFE_ACQUIRE_UNEXPECTED_QUEUE_STATUS:%',coalesce(v_queue_status,'<NULL>');
  END IF;

  LOOP
    v_expired_owner:=NULL;

    DELETE FROM public.ia_session_locks l
    WHERE l.session_id=v_session AND l.locked_until<=clock_timestamp()
    RETURNING l.owner INTO v_expired_owner;

    IF v_expired_owner IS NOT NULL THEN
      UPDATE public.ia_turn_queue
      SET status='FAILED',finished_at=clock_timestamp(),updated_at=clock_timestamp(),last_error='LOCK_EXPIRED'
      WHERE session_id=v_session AND owner=v_expired_owner AND status='PROCESSING';
    END IF;

    UPDATE public.ia_turn_queue
    SET status='FAILED',finished_at=clock_timestamp(),updated_at=clock_timestamp(),last_error='QUEUE_WAIT_EXPIRED'
    WHERE session_id=v_session AND status='PENDING'
      AND enqueued_at<clock_timestamp()-interval '5 minutes';

    SELECT q.status,q.attempts
    INTO v_queue_status,v_queue_attempts
    FROM public.ia_turn_queue q
    WHERE q.session_id=v_session AND q.message_id=v_message;

    IF v_queue_status='FAILED' THEN
      RETURN jsonb_build_object('ok',true,'acquired',false,'idempotent',true,'reason','FAILED_REQUIRES_NEW_MESSAGE_ID','session_id',v_session,'message_id',v_message,'attempts',v_queue_attempts);
    END IF;

    SELECT q.message_id,
           (q.status='PROCESSING' OR q.enqueued_at<=clock_timestamp()-v_settle)
    INTO v_head_message,v_head_ready
    FROM public.ia_turn_queue q
    WHERE q.session_id=v_session AND q.status IN('PENDING','PROCESSING')
    ORDER BY coalesce(q.source_sent_at,q.enqueued_at),q.source_sequence NULLS LAST,q.enqueued_at,q.id
    LIMIT 1;

    IF (v_head_message IS NULL OR v_head_message=v_message)
       AND coalesce(v_head_ready,true) THEN
      v_acquired:=false;

      INSERT INTO public.ia_session_locks AS l(session_id,owner,locked_until,updated_at)
      VALUES(v_session,v_owner,clock_timestamp()+make_interval(secs=>v_ttl),clock_timestamp())
      ON CONFLICT(session_id) DO UPDATE
      SET owner=excluded.owner,locked_until=excluded.locked_until,updated_at=excluded.updated_at
      WHERE l.locked_until<=clock_timestamp()
      RETURNING true INTO v_acquired;

      IF coalesce(v_acquired,false) THEN
        UPDATE public.ia_turn_queue
        SET owner=v_owner,status='PROCESSING',started_at=coalesce(started_at,clock_timestamp()),
            attempts=attempts+1,updated_at=clock_timestamp(),last_error=NULL
        WHERE message_id=v_message AND session_id=v_session AND status='PENDING';

        GET DIAGNOSTICS v_affected=ROW_COUNT;

        IF v_affected<>1 THEN
          RAISE EXCEPTION USING errcode='40001', message=format('SAFE_ACQUIRE_QUEUE_STATE_CHANGED affected_rows=%s',v_affected);
        END IF;

        RETURN jsonb_build_object(
          'ok',true,'acquired',true,'idempotent',false,'reason','ACQUIRED',
          'session_id',v_session,'message_id',v_message,'owner',v_owner,
          'queue_head',true,'source_ordered',true,'attempts',v_queue_attempts+1,
          'locked_until',clock_timestamp()+make_interval(secs=>v_ttl)
        );
      END IF;
    END IF;

    IF extract(epoch FROM(clock_timestamp()-v_started_at))>=v_wait THEN
      UPDATE public.ia_turn_queue
      SET last_error='SESSION_BUSY',updated_at=clock_timestamp()
      WHERE message_id=v_message AND session_id=v_session AND status='PENDING';

      RAISE EXCEPTION USING errcode='55P03', message=format('SESSION_BUSY head=%s current=%s',coalesce(v_head_message,'NONE'),v_message);
    END IF;

    PERFORM pg_sleep(0.20);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ia_adquirir_turno(
  p_session_id text,
  p_owner text,
  p_ttl_seconds integer DEFAULT 180,
  p_wait_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  IF nullif(btrim(p_session_id),'') IS NULL OR nullif(btrim(p_owner),'') IS NULL THEN
    RETURN jsonb_build_object('ok',false,'acquired',false,'reason','MISSING_KEYS');
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'acquired',false,
    'idempotent',true,
    'reason','MESSAGE_ID_REQUIRED',
    'session_id',btrim(p_session_id)
  );
END;
$$;
