begin;

create or replace function public.crm_product_catalog_rag()
returns table (
  categoria_id text,
  categoria_codigo text,
  categoria_nombre text,
  categoria_orden integer,
  subcategoria_id text,
  subcategoria_codigo text,
  subcategoria_nombre text,
  subcategoria_orden integer,
  producto_id text,
  producto_codigo text,
  sku text,
  ean text,
  part_number text,
  producto_nombre text,
  nombre_corto text,
  marca text,
  modelo text,
  variante text,
  producto_activo boolean,
  rag_chunks bigint,
  embedding_chunks bigint,
  atributos jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with doc_counts as (
    select d.producto_id,
           count(*)::bigint as rag_chunks,
           count(d.embedding)::bigint as embedding_chunks
      from public.documents d
     where d.producto_id is not null
     group by d.producto_id
  ), attrs as (
    select a.producto_id,
           jsonb_agg(
             jsonb_build_object(
               'key', a.atributo_clave,
               'text', a.valor_texto,
               'number', a.valor_numero,
               'boolean', a.valor_booleano,
               'json', a.valor_json,
               'unit', a.unidad
             ) order by a.atributo_clave
           ) as atributos
      from public.catalogo_producto_atributos a
     where a.activo = true
     group by a.producto_id
  )
  select c.categoria_id,
         c.categoria_codigo,
         c.nombre as categoria_nombre,
         c.orden as categoria_orden,
         s.subcategoria_id,
         s.subcategoria_codigo,
         s.nombre as subcategoria_nombre,
         s.orden as subcategoria_orden,
         p.producto_id,
         p.producto_codigo,
         p.sku,
         p.ean,
         p.part_number,
         p.nombre as producto_nombre,
         p.nombre_corto,
         p.marca,
         p.modelo,
         p.variante,
         p.activo as producto_activo,
         coalesce(dc.rag_chunks, 0)::bigint,
         coalesce(dc.embedding_chunks, 0)::bigint,
         coalesce(a.atributos, '[]'::jsonb)
    from public.catalogo_productos p
    left join public.catalogo_categorias c on c.categoria_id = p.categoria_id
    left join public.catalogo_subcategorias s on s.subcategoria_id = p.subcategoria_id
    left join doc_counts dc on dc.producto_id = p.producto_id
    left join attrs a on a.producto_id = p.producto_id
   order by coalesce(c.orden, 2147483647), c.nombre nulls last,
            coalesce(s.orden, 2147483647), s.nombre nulls last,
            p.nombre;
$$;

revoke all on function public.crm_product_catalog_rag() from public;
grant execute on function public.crm_product_catalog_rag() to authenticated;
grant execute on function public.crm_product_catalog_rag() to service_role;

commit;
