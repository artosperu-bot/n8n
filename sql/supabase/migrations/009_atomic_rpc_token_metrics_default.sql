-- Harden atomic v46 against callers that omit token-detail telemetry.
do $$
declare
  v_ddl text;
  v_old text := $needle$'snapshot_producto_activo','{}'::jsonb,'session_id'$needle$;
  v_new text := $needle$'snapshot_producto_activo','{}'::jsonb,'metricas_tokens_detalle','[]'::jsonb,'session_id'$needle$;
begin
  select pg_get_functiondef('public.ia_persistir_turno_atomico_v46(text,jsonb,jsonb)'::regprocedure) into v_ddl;
  if position(v_old in v_ddl)=0 then
    raise exception 'ATOMIC_V46_PATCH_POINT_NOT_FOUND';
  end if;
  v_ddl := replace(v_ddl,v_old,v_new);
  execute v_ddl;
end;
$$;
