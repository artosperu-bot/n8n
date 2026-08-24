-- Preserve pre-v46 atomic persistence RPC for rollback.
do $$
declare
  v_ddl text;
begin
  if to_regprocedure('public.ia_persistir_turno_atomico_pre_v46(text,jsonb,jsonb)') is null then
    select pg_get_functiondef('public.ia_persistir_turno_atomico(text,jsonb,jsonb)'::regprocedure) into v_ddl;
    v_ddl := replace(v_ddl,'CREATE OR REPLACE FUNCTION public.ia_persistir_turno_atomico(','CREATE OR REPLACE FUNCTION public.ia_persistir_turno_atomico_pre_v46(');
    execute v_ddl;
  end if;
end;
$$;
