-- STECH data contract v46: canonical ia_contexto projection.

create or replace function public.ia_enforce_canonical_context_v46()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_nombre text;
  v_marca text;
  v_categoria text;
  v_subcategoria text;
  v_codigo text;
  v_product jsonb;
  v_legacy jsonb;
begin
  new.contexto := coalesce(new.contexto,'{}'::jsonb);

  if nullif(btrim(coalesce(new.producto_activo_id,'')),'') is not null then
    select cp.nombre_corto, cp.marca, cc.nombre, cs.nombre, cp.producto_codigo
      into v_nombre, v_marca, v_categoria, v_subcategoria, v_codigo
      from public.catalogo_productos cp
      left join public.catalogo_categorias cc
        on cc.categoria_id=cp.categoria_id and cc.activo=true
      left join public.catalogo_subcategorias cs
        on cs.subcategoria_id=cp.subcategoria_id and cs.activo=true
     where cp.producto_id=new.producto_activo_id
       and cp.activo=true;

    if not found then
      raise exception using
        errcode='23503',
        message=format('ACTIVE_PRODUCT_NOT_IN_CATALOG:%s',new.producto_activo_id);
    end if;

    v_product := coalesce(new.contexto->'product','{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'activeProduct',v_nombre,
        'productId',new.producto_activo_id,
        'productCode',v_codigo,
        'brand',v_marca,
        'category',v_categoria,
        'subcategory',v_subcategoria
      ));
    new.contexto := jsonb_set(new.contexto,'{product}',v_product,true);

    v_legacy := coalesce(new.contexto->'producto_activo','{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'producto_id',new.producto_activo_id,
        'producto_codigo',v_codigo,
        'nombre',v_nombre,
        'nombre_corto',v_nombre,
        'marca',v_marca,
        'categoria',v_categoria,
        'subcategoria',v_subcategoria
      ));
    new.contexto := jsonb_set(new.contexto,'{producto_activo}',v_legacy,true);
  end if;

  -- Retired flat projections are neutralized during compatibility rollout.
  new.ultimo_tipo_mensaje := null;
  new.ultimo_oficio_detectado := null;
  new.ultimo_sector_detectado := null;
  new.necesita_clasificacion_ia := null;
  new.alcance_consulta := null;

  -- `version` remains physically required until the final destructive migration.
  new.version := coalesce(new.context_version,new.version,0);
  return new;
end;
$$;

drop trigger if exists ia_contexto_canonical_v46_trg on public.ia_contexto;
create trigger ia_contexto_canonical_v46_trg
before insert or update on public.ia_contexto
for each row execute function public.ia_enforce_canonical_context_v46();
