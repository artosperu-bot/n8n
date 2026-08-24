do $$
declare
  v_ddl text;
begin
  if to_regprocedure('public.crm_api_pre_v46(text,text,jsonb)') is null then
    raise exception 'crm_api_pre_v46 backup is missing';
  end if;
  select pg_get_functiondef('public.crm_api_pre_v46(text,text,jsonb)'::regprocedure) into v_ddl;
  v_ddl := replace(v_ddl,'CREATE OR REPLACE FUNCTION public.crm_api_pre_v46(','CREATE OR REPLACE FUNCTION public.crm_api(');
  execute v_ddl;
end;
$$;
drop function if exists public.crm_api_v46(text,text,jsonb);
