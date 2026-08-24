begin;
insert into public.ia_sesiones(session_id,canal,estado)
values('qa-atomic-v46-rollback','qa','activa')
on conflict(session_id) do nothing;

insert into public.ia_session_locks(session_id,owner,locked_until)
values('qa-atomic-v46-rollback','qa-owner-v46',clock_timestamp()+interval '5 minutes')
on conflict(session_id) do update set owner=excluded.owner,locked_until=excluded.locked_until;

select public.ia_persistir_turno_atomico(
  'qa-owner-v46',
  jsonb_build_object(
    'session_id','qa-atomic-v46-rollback','message_id','qa-atomic-v46-m1','request_id','qa-atomic-v46-r1',
    'mensaje_cliente','precio armor 22','respuesta_bot','S/ 1299','intencion','PRICE','ruta','SQL_PRICE',
    'producto_id_resuelto','P-ARMOR-22-256G','producto_codigo_resuelto','P999999','estado_resolucion_producto','CONFIRMADO',
    'origen_resolucion_producto','MENSAJE_ACTUAL','categoria','WRONG','marca_detectada','WRONG','producto_detectado','WRONG',
    'objetivo','SOFT_CLOSE','perfil_cliente','OBRA','alcance_consulta','SQL_PRICE','probabilidad_compra',99,
    'siguiente_accion','ANSWER_ONLY','nivel_interes',25
  ),
  jsonb_build_object(
    'session_id','qa-atomic-v46-rollback','context_version',1,'ultima_intencion','PRICE','ultima_accion','ANSWER_ONLY','ultima_ruta','SQL_PRICE',
    'ultimo_mensaje_cliente','precio armor 22','ultima_respuesta_bot','S/ 1299','etapa_conversacion','EVALUACION',
    'producto_activo_id','P-ARMOR-22-256G','senal_compra',false,'alcance_consulta','SQL_PRICE',
    'contexto',jsonb_build_object(
      'commercial',jsonb_build_object('readiness','EVALUATING_PURCHASE','interestLevel',25,'purchaseSignal',false),
      'customer',jsonb_build_object('useCase',null)
    )
  )
);

do $$
declare r record;
begin
  select c.producto_detectado,c.marca_detectada,c.categoria,c.producto_codigo_resuelto,
         c.objetivo,c.perfil_cliente,c.alcance_consulta,c.probabilidad_compra,c.metricas_tokens_detalle,
         x.contrato_version,x.context_version,x.alcance_consulta as context_scope,x.contexto->'product' as product,
         x.contexto#>>'{commercial,readiness}' as readiness,s.probabilidad_compra as session_probability
    into r
    from public.ia_conversaciones c
    join public.ia_contexto x using(session_id)
    join public.ia_sesiones s using(session_id)
   where c.session_id='qa-atomic-v46-rollback';

  if r.producto_detectado is distinct from 'Armor 22' then raise exception 'QA_FAIL product'; end if;
  if r.marca_detectada is distinct from 'ULEFONE' then raise exception 'QA_FAIL brand'; end if;
  if r.categoria is distinct from 'Celulares y Teléfonos' then raise exception 'QA_FAIL category'; end if;
  if r.producto_codigo_resuelto is distinct from 'P000049' then raise exception 'QA_FAIL code'; end if;
  if r.objetivo is not null or r.perfil_cliente is not null or r.alcance_consulta is not null or r.probabilidad_compra is not null then raise exception 'QA_FAIL retired turn field'; end if;
  if r.context_scope is not null or r.session_probability is not null then raise exception 'QA_FAIL retired current/session field'; end if;
  if r.contrato_version is distinct from '46.0' or r.context_version is distinct from 1 then raise exception 'QA_FAIL contract/version'; end if;
  if r.product->>'brand' is distinct from 'ULEFONE' or r.product->>'category' is distinct from 'Celulares y Teléfonos' then raise exception 'QA_FAIL canonical product json'; end if;
  if r.readiness is distinct from 'EVALUATING_PURCHASE' then raise exception 'QA_FAIL readiness'; end if;
  if r.metricas_tokens_detalle is distinct from '[]'::jsonb then raise exception 'QA_FAIL token metrics default'; end if;
end;
$$;
rollback;
select 'ATOMIC_RPC_V46_QA_PASS' as status;
