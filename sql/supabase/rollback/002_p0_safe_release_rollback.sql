-- EXACT PRE-SCRIPT-C BASELINE captured 2026-08-12.

create or replace function public.ia_liberar_turno(p_session_id text, p_owner text, p_message_id text)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_session text := nullif(btrim(p_session_id), '');
  v_owner text := nullif(btrim(p_owner), '');
  v_message text := nullif(btrim(p_message_id), '');
  v_deleted integer := 0;
begin
  if v_session is null or v_owner is null or v_message is null then
    return jsonb_build_object('ok', false,'released', false,'reason', 'MISSING_KEYS');
  end if;

  delete from public.ia_session_locks
   where session_id = v_session and owner = v_owner;
  get diagnostics v_deleted = row_count;

  update public.ia_turn_queue
     set status = 'DONE',
         finished_at = clock_timestamp(),
         updated_at = clock_timestamp(),
         last_error = null
   where session_id = v_session
     and message_id = v_message
     and (owner = v_owner or owner is null);

  return jsonb_build_object('ok', true,'released', v_deleted > 0,'session_id', v_session,'message_id', v_message);
end;
$$;

create or replace function public.ia_liberar_turno(p_session_id text, p_owner text)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_deleted integer;
begin
  if nullif(btrim(p_session_id), '') is null or nullif(btrim(p_owner), '') is null then
    return jsonb_build_object('ok', false,'released', false,'reason', 'MISSING_KEYS');
  end if;

  delete from public.ia_session_locks
   where session_id = btrim(p_session_id)
     and owner = btrim(p_owner);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('ok', true,'released', v_deleted > 0,'session_id', btrim(p_session_id));
end;
$$;

alter function public.ia_liberar_turno(text,text,text) owner to postgres;
alter function public.ia_liberar_turno(text,text) owner to postgres;

revoke all on function public.ia_liberar_turno(text,text,text) from public, anon, authenticated;
revoke all on function public.ia_liberar_turno(text,text) from public, anon, authenticated;
grant execute on function public.ia_liberar_turno(text,text,text) to postgres, service_role;
grant execute on function public.ia_liberar_turno(text,text) to postgres, service_role;
