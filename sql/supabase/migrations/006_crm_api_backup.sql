-- Preserve the pre-v46 CRM API body for immediate rollback.
do $$
declare
  v_ddl text;
begin
  if to_regprocedure('public.crm_api_pre_v46(text,text,jsonb)') is null then
    select pg_get_functiondef('public.crm_api(text,text,jsonb)'::regprocedure) into v_ddl;
    v_ddl := replace(v_ddl,'CREATE OR REPLACE FUNCTION public.crm_api(','CREATE OR REPLACE FUNCTION public.crm_api_pre_v46(');
    execute v_ddl;
  end if;
end;
$$;
