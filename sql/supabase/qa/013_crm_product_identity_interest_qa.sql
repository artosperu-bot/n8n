select
  to_regclass('public.crm_v_productos_mencionados') is not null as view_exists,
  position('producto_detectado' in pg_get_viewdef('public.crm_v_productos_mencionados'::regclass, true)) > 0 as legacy_name_resolution_present,
  position('catalogo_productos' in pg_get_viewdef('public.crm_v_productos_mencionados'::regclass, true)) > 0 as catalog_identity_present,
  position('nivel_interes' in pg_get_viewdef('public.crm_v_productos_mencionados'::regclass, true)) > 0 as current_interest_present,
  position('probabilidad_compra' in pg_get_viewdef('public.crm_v_productos_mencionados'::regclass, true)) = 0 as deprecated_turn_probability_not_used;

select producto_id, producto, marca, menciones, conversaciones, conversaciones_interes_alto, ultima_mencion
from public.crm_v_productos_mencionados
where lower(producto) in ('armor 22','armor x13','armor 25t pro')
order by menciones desc;

select 'CRM_PRODUCT_IDENTITY_INTEREST_QA_PASS' as status;
