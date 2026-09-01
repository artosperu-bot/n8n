-- CRM product analytics must report one row per canonical catalog product.
-- Historical turns may have producto_detectado populated while producto_id_resuelto is NULL.
-- This view resolves those legacy name-only rows at read time without rewriting history.
-- Ambiguous catalog names are deliberately left unresolved instead of guessing.

create or replace view public.crm_v_productos_mencionados as
with producto_resuelto as (
  select
    ic.session_id,
    ic.fecha,
    ic.nivel_interes,
    ic.producto_detectado,
    ic.producto_id_resuelto,
    coalesce(cp_direct.producto_id, cp_nombre.producto_id) as producto_id_canonico,
    coalesce(
      cp_direct.nombre_corto,
      cp_direct.nombre,
      cp_nombre.nombre_corto,
      cp_nombre.nombre,
      ic.producto_detectado,
      'Sin identificar'::text
    ) as producto_canonico,
    coalesce(cp_direct.marca, cp_nombre.marca, ic.marca_detectada) as marca_canonica,
    coalesce(ctx.senal_compra, false) as senal_compra,
    lower(coalesce(ctx.contexto ->> 'interestSignal', 'false')) = 'true' as interest_signal,
    lower(coalesce(ctx.contexto ->> 'purchaseSignal', 'false')) = 'true' as purchase_signal,
    nullif(ctx.contexto ->> 'activeProductId', '') as contexto_producto_activo_id,
    nullif(ctx.contexto ->> 'activeProduct', '') as contexto_producto_activo,
    nullif(ctx.contexto ->> 'selectedProduct', '') as contexto_producto_seleccionado,
    nullif(ctx.contexto ->> 'recommendedProduct', '') as contexto_producto_recomendado
  from public.ia_conversaciones ic
  left join public.catalogo_productos cp_direct
    on cp_direct.producto_id = ic.producto_id_resuelto
  left join lateral (
    select cp.producto_id, cp.nombre_corto, cp.nombre, cp.marca
    from public.catalogo_productos cp
    where ic.producto_id_resuelto is null
      and nullif(trim(ic.producto_detectado), '') is not null
      and lower(regexp_replace(trim(ic.producto_detectado), '\s+', ' ', 'g')) in (
        lower(regexp_replace(trim(coalesce(cp.nombre_corto, '')), '\s+', ' ', 'g')),
        lower(regexp_replace(trim(coalesce(cp.nombre, '')), '\s+', ' ', 'g'))
      )
      and 1 = (
        select count(*)
        from public.catalogo_productos cp2
        where lower(regexp_replace(trim(ic.producto_detectado), '\s+', ' ', 'g')) in (
          lower(regexp_replace(trim(coalesce(cp2.nombre_corto, '')), '\s+', ' ', 'g')),
          lower(regexp_replace(trim(coalesce(cp2.nombre, '')), '\s+', ' ', 'g'))
        )
      )
    order by
      case
        when lower(regexp_replace(trim(ic.producto_detectado), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(cp.nombre_corto, '')), '\s+', ' ', 'g')) then 0
        else 1
      end,
      cp.producto_id
    limit 1
  ) cp_nombre on true
  left join public.ia_contexto ctx
    on ctx.session_id = ic.session_id
  where coalesce(ic.producto_id_resuelto, ic.producto_detectado) is not null
), marcado as (
  select
    pr.*,
    (
      coalesce(pr.nivel_interes, 0) >= 60
      or (
        (pr.interest_signal or pr.purchase_signal or pr.senal_compra)
        and (
          (pr.producto_id_canonico is not null and pr.contexto_producto_activo_id = pr.producto_id_canonico)
          or lower(coalesce(pr.contexto_producto_activo, '')) = lower(coalesce(pr.producto_canonico, ''))
          or lower(coalesce(pr.contexto_producto_seleccionado, '')) = lower(coalesce(pr.producto_canonico, ''))
          or lower(coalesce(pr.contexto_producto_recomendado, '')) = lower(coalesce(pr.producto_canonico, ''))
        )
      )
    ) as es_interes_alto
  from producto_resuelto pr
)
select
  producto_id_canonico as producto_id,
  producto_canonico as producto,
  marca_canonica as marca,
  count(*) as menciones,
  count(distinct session_id) as conversaciones,
  max(fecha) as ultima_mencion,
  null::numeric as probabilidad_compra_promedio,
  count(distinct session_id) filter (where es_interes_alto) as conversaciones_interes_alto
from marcado
group by producto_id_canonico, producto_canonico, marca_canonica;

comment on view public.crm_v_productos_mencionados is
'Analitica CRM por identidad canonica de catalogo. Resuelve historicos nombre-only de forma no ambigua y usa nivel_interes/interestSignal/purchaseSignal/senal_compra; probabilidad_compra queda solo como columna legacy de compatibilidad.';
