-- Harden atomic v46 against callers that omit automatic-reply blocking.
do $$
declare
  v_ddl text;
  v_old text := $needle$'derivacion_activa',false,'context_version'$needle$;
  v_new text := $needle$'derivacion_activa',false,'bloquear_respuesta_automatica',false,'context_version'$needle$;
begin
  select pg_get_functiondef('public.ia_persistir_turno_atomico_v46(text,jsonb,jsonb)'::regprocedure) into v_ddl;
  if position(v_old in v_ddl)=0 then
    raise exception 'ATOMIC_V46_BLOCK_PATCH_POINT_NOT_FOUND';
  end if;
  v_ddl := replace(v_ddl,v_old,v_new);
  execute v_ddl;
end;
$$;
