-- STECH data contract v46: canonical catalog projection + retired-field neutralization.
-- Non-destructive: keeps columns for compatibility, but stops treating them as active contract fields.

create or replace function public.ia_enforce_canonical_turn_v46()
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
begin
  if upper(coalesce(new.estado_resolucion_producto,'')) = 'CONFIRMADO'
     and nullif(btrim(new.producto_id_resuelto),'') is not null then
    select cp.nombre_corto, cp.marca, cc.nombre, cs.nombre, cp.producto_codigo
      into v_nombre, v_marca, v_categoria, v_subcategoria, v_codigo
      from public.catalogo_productos cp
      left join public.catalogo_categorias cc
        on cc.categoria_id = cp.categoria_id and cc.activo = true
      left join public.catalogo_subcategorias cs
        on cs.subcategoria_id = cp.subcategoria_id and cs.activo = true
     where cp.producto_id = new.producto_id_resuelto
       and cp.activo = true;

    if not found then
      raise exception using
        errcode='23503',
        message=format('CONFIRMED_PRODUCT_NOT_IN_ACTIVE_CATALOG:%s',new.producto_id_resuelto);
    end if;

    new.producto_detectado := v_nombre;
    new.marca_detectada := v_marca;
    new.categoria := v_categoria;
    new.producto_codigo_resuelto := v_codigo;
    new.producto_objetivo_turno := coalesce(new.producto_objetivo_turno,'{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'producto_id',new.producto_id_resuelto,
        'producto_codigo',v_codigo,
        'nombre',v_nombre,
        'nombre_corto',v_nombre,
        'marca',v_marca,
        'categoria',v_categoria,
        'subcategoria',v_subcategoria
      ));
  else
    -- Do not let free text become catalog authority.
    new.marca_detectada := null;
    if nullif(btrim(coalesce(new.producto_id_resuelto,'')),'') is null then
      new.categoria := null;
    end if;
  end if;

  -- Retired fields remain physically present only for compatibility during rollout.
  new.objetivo := null;
  new.confianza := null;
  new.costo_prompt_estimado := null;
  new.costo_estimado_usd := null;
  new.intent_score := null;
  new.estado_emocional := null;
  new.probabilidad_compra := null;
  new.perfil_cliente := null;
  new.urgencia := null;
  new.limitacion_agente := null;
  new.alcance_consulta := null;

  return new;
end;
$$;

drop trigger if exists ia_conversaciones_canonical_v46_trg on public.ia_conversaciones;
create trigger ia_conversaciones_canonical_v46_trg
before insert or update on public.ia_conversaciones
for each row execute function public.ia_enforce_canonical_turn_v46();

create or replace function public.ia_enforce_session_commercial_v46()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Numeric purchase probability has no canonical authority.
  new.probabilidad_compra := null;
  return new;
end;
$$;

drop trigger if exists ia_sesiones_canonical_v46_trg on public.ia_sesiones;
create trigger ia_sesiones_canonical_v46_trg
before insert or update on public.ia_sesiones
for each row execute function public.ia_enforce_session_commercial_v46();
