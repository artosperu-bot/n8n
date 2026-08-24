begin;
insert into public.ia_sesiones(session_id,canal,estado)
values('qa-context-v46-rollback','qa','activa')
on conflict(session_id) do nothing;

insert into public.ia_contexto(
  session_id,canal,contexto,version,context_version,contrato_version,
  derivacion_activa,bloquear_respuesta_automatica,producto_activo_id,
  ultimo_tipo_mensaje,ultimo_oficio_detectado,ultimo_sector_detectado,
  necesita_clasificacion_ia,alcance_consulta
) values (
  'qa-context-v46-rollback','qa','{"commercial":{"readiness":"FIT_READY"}}'::jsonb,
  1,1,'45.42',false,false,'P-ARMOR-22-256G','X','OBRA','CONSTRUCCION',true,'RAG_PRODUCT'
);

do $$
declare r record;
begin
  select contexto->'product' as product,
         ultimo_tipo_mensaje,ultimo_oficio_detectado,ultimo_sector_detectado,
         necesita_clasificacion_ia,alcance_consulta,version,context_version
    into r
    from public.ia_contexto
   where session_id='qa-context-v46-rollback';

  if r.product->>'activeProduct' is distinct from 'Armor 22' then raise exception 'QA_FAIL activeProduct'; end if;
  if r.product->>'brand' is distinct from 'ULEFONE' then raise exception 'QA_FAIL brand'; end if;
  if r.product->>'category' is distinct from 'Celulares y Teléfonos' then raise exception 'QA_FAIL category'; end if;
  if r.product->>'subcategory' is distinct from 'Celulares Smartphones' then raise exception 'QA_FAIL subcategory'; end if;
  if r.ultimo_tipo_mensaje is not null or r.ultimo_oficio_detectado is not null or r.ultimo_sector_detectado is not null
     or r.necesita_clasificacion_ia is not null or r.alcance_consulta is not null then
    raise exception 'QA_FAIL retired context projection persisted';
  end if;
  if r.version is distinct from r.context_version then raise exception 'QA_FAIL version compatibility'; end if;
end;
$$;
rollback;
select 'DATA_CONTRACT_CONTEXT_V46_QA_PASS' as status;
