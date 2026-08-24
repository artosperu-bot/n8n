select
  to_regprocedure('public.crm_api(text,text,jsonb)') is not null as crm_api_exists,
  to_regprocedure('public.crm_api_v46(text,text,jsonb)') is not null as crm_v46_exists,
  to_regprocedure('public.crm_api_pre_v46(text,text,jsonb)') is not null as rollback_backup_exists,
  position('public.crm_api_v46' in pg_get_functiondef('public.crm_api(text,text,jsonb)'::regprocedure)) > 0 as wrapper_ok,
  position('s.probabilidad_compra' in pg_get_functiondef('public.crm_api_v46(text,text,jsonb)'::regprocedure)) = 0 as no_session_probability_read,
  position('sum(costo_estimado_usd)' in pg_get_functiondef('public.crm_api_v46(text,text,jsonb)'::regprocedure)) = 0 as no_fake_cost_sum;

do $$
begin
  begin
    perform public.crm_api('__definitely_invalid_v46__','dashboard','{}'::jsonb);
    raise exception 'QA_FAIL unauthorized token accepted';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

select 'CRM_V46_QA_PASS' as status;
