begin;

insert into public.ia_sesiones(session_id,canal,estado,etapa_comercial,probabilidad_compra)
values ('qa-contract-v46-rollback','qa','activa','CIERRE',85)
on conflict(session_id) do update
set etapa_comercial=excluded.etapa_comercial,
    probabilidad_compra=excluded.probabilidad_compra;

insert into public.ia_conversaciones(
 session_id,mensaje_cliente,respuesta_bot,intencion,categoria,producto_detectado,marca_detectada,
 producto_id_resuelto,producto_codigo_resuelto,estado_resolucion_producto,origen_resolucion_producto,
 objetivo,confianza,costo_prompt_estimado,costo_estimado_usd,intent_score,estado_emocional,probabilidad_compra,
 perfil_cliente,urgencia,limitacion_agente,alcance_consulta,message_id,request_id
) values (
 'qa-contract-v46-rollback','precio armor 22','S/ 1299','PRICE','WRONG','WRONG','WRONG',
 'P-ARMOR-22-256G','P999999','CONFIRMADO','MENSAJE_ACTUAL',
 'SOFT_CLOSE',0.77,1.23,4.56,88,'ANSIOSO',90,'OBRA','ALTA',true,'SQL_PRICE','qa-v46-m1','qa-v46-r1'
);

do $$
declare
  r record;
begin
  select c.producto_detectado,c.marca_detectada,c.categoria,c.producto_codigo_resuelto,
         c.objetivo,c.confianza,c.costo_prompt_estimado,c.costo_estimado_usd,c.intent_score,c.estado_emocional,
         c.probabilidad_compra,c.perfil_cliente,c.urgencia,c.limitacion_agente,c.alcance_consulta,
         s.probabilidad_compra as session_probability
    into r
    from public.ia_conversaciones c
    join public.ia_sesiones s using(session_id)
   where c.session_id='qa-contract-v46-rollback'
   order by c.fecha desc
   limit 1;

  if r.producto_detectado is distinct from 'Armor 22' then raise exception 'QA_FAIL producto_detectado=%',r.producto_detectado; end if;
  if r.marca_detectada is distinct from 'ULEFONE' then raise exception 'QA_FAIL marca_detectada=%',r.marca_detectada; end if;
  if r.categoria is distinct from 'Celulares y Teléfonos' then raise exception 'QA_FAIL categoria=%',r.categoria; end if;
  if r.producto_codigo_resuelto is distinct from 'P000049' then raise exception 'QA_FAIL producto_codigo=%',r.producto_codigo_resuelto; end if;
  if r.objetivo is not null or r.confianza is not null or r.costo_prompt_estimado is not null or r.costo_estimado_usd is not null
     or r.intent_score is not null or r.estado_emocional is not null or r.probabilidad_compra is not null
     or r.perfil_cliente is not null or r.urgencia is not null or r.limitacion_agente is not null or r.alcance_consulta is not null then
    raise exception 'QA_FAIL retired ia_conversaciones field persisted';
  end if;
  if r.session_probability is not null then raise exception 'QA_FAIL session probability persisted=%',r.session_probability; end if;
end;
$$;

rollback;

select 'DATA_CONTRACT_V46_QA_PASS' as status;
