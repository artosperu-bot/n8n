do $$
declare
  v_ddl text;
begin
  if to_regprocedure('public.ia_persistir_turno_atomico_pre_v46(text,jsonb,jsonb)') is null then
    raise exception 'ia_persistir_turno_atomico_pre_v46 backup is missing';
  end if;
  select pg_get_functiondef('public.ia_persistir_turno_atomico_pre_v46(text,jsonb,jsonb)'::regprocedure) into v_ddl;
  v_ddl := replace(v_ddl,'CREATE OR REPLACE FUNCTION public.ia_persistir_turno_atomico_pre_v46(','CREATE OR REPLACE FUNCTION public.ia_persistir_turno_atomico(');
  execute v_ddl;
end;
$$;
drop function if exists public.ia_persistir_turno_atomico_v46(text,jsonb,jsonb);
