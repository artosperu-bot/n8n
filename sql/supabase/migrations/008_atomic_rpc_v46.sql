-- STECH atomic persistence v46.
-- Preserves lease/idempotency/version semantics; removes pseudo probability and retired alcance_consulta dependency.

create or replace function public.ia_persistir_turno_atomico_v46(
  p_owner text,
  p_conversacion jsonb,
  p_contexto jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $$
declare
  v_session_id text := nullif(btrim(coalesce(p_contexto ->> 'session_id', p_conversacion ->> 'session_id')), '');
  v_message_id text := nullif(btrim(p_conversacion ->> 'message_id'), '');
  v_request_id text := nullif(btrim(p_conversacion ->> 'request_id'), '');
  v_owner text := nullif(btrim(p_owner), '');
  v_lock_until timestamptz;
  v_current_version bigint := 0;
  v_proposed_version bigint;
  v_existing_session text;
  v_conversation_id uuid;
  v_conv_payload jsonb;
  v_ctx_payload jsonb;
  v_nested_context jsonb;
  v_conv public.ia_conversaciones%rowtype;
  v_ctx public.ia_contexto%rowtype;
begin
  if v_session_id is null or v_owner is null or v_message_id is null then
    raise exception using errcode = '22023', message = 'SESSION_OWNER_MESSAGE_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_session_id, 0));

  select l.locked_until
    into v_lock_until
    from public.ia_session_locks as l
   where l.session_id = v_session_id
     and l.owner = v_owner
   for update;

  if not found or v_lock_until <= clock_timestamp() then
    raise exception using errcode = '55P03', message = 'SESSION_LEASE_MISSING_OR_EXPIRED';
  end if;

  select c.context_version
    into v_current_version
    from public.ia_contexto as c
   where c.session_id = v_session_id
   for update;

  if not found then
    v_current_version := 0;
  else
    v_current_version := coalesce(v_current_version, 0);
  end if;

  select c.id, c.session_id
    into v_conversation_id, v_existing_session
    from public.ia_conversaciones as c
   where c.message_id = v_message_id
   limit 1;

  if v_conversation_id is null and v_request_id is not null then
    select c.id, c.session_id
      into v_conversation_id, v_existing_session
      from public.ia_conversaciones as c
     where c.request_id = v_request_id
     limit 1;
  end if;

  if v_conversation_id is not null and v_existing_session <> v_session_id then
    raise exception using errcode = '23505', message = 'IDEMPOTENCY_KEY_SESSION_MISMATCH';
  end if;

  if v_conversation_id is not null
     and exists (
       select 1
         from public.ia_contexto as c
        where c.session_id = v_session_id
          and c.ultimo_message_id = v_message_id
     ) then
    return jsonb_build_object(
      'ok', true,
      'status', 'IDEMPOTENT',
      'session_id', v_session_id,
      'conversation_id', v_conversation_id,
      'context_version', v_current_version
    );
  end if;

  begin
    v_proposed_version := nullif(p_contexto ->> 'context_version', '')::bigint;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'INVALID_CONTEXT_VERSION';
  end;

  if v_proposed_version is null then
    v_proposed_version := v_current_version + 1;
  end if;

  if v_proposed_version <> v_current_version + 1 then
    raise exception using
      errcode = '40001',
      message = format('CONTEXT_VERSION_CONFLICT expected=%s received=%s', v_current_version + 1, v_proposed_version);
  end if;

  if v_conversation_id is null then
    v_conv_payload :=
      jsonb_build_object(
        'id', gen_random_uuid(),
        'fecha', clock_timestamp(),
        'error_detectado', false,
        'requiere_sql', false,
        'requiere_rag', false,
        'requiere_rag_institucional', false,
        'requiere_imagenes', false,
        'cambio_producto_explicito', false,
        'productos_mencionados', '[]'::jsonb,
        'parametros', '{}'::jsonb,
        'atributos_consultados', '[]'::jsonb,
        'reglas_aplicadas', '[]'::jsonb,
        'reglas_institucionales_usadas', '[]'::jsonb,
        'advertencias', '[]'::jsonb,
        'interpretador_ejecutado', false,
        'redactor_ejecutado', false,
        'tokens_estimados', 0,
        'tokens_prompt_estimados', 0,
        'tokens_respuesta_estimados', 0,
        'estado_spin', 'S',
        'estado_spin_actual', 'S',
        'validacion_spin', '{}'::jsonb,
        'snapshot_spin', '{}'::jsonb,
        'snapshot_contexto', '{}'::jsonb,
        'snapshot_producto_activo', '{}'::jsonb,
        'session_id', v_session_id,
        'message_id', v_message_id
      )
      || coalesce(p_conversacion, '{}'::jsonb)
      || jsonb_build_object('session_id', v_session_id, 'message_id', v_message_id);

    v_conv := jsonb_populate_record(null::public.ia_conversaciones, v_conv_payload);

    insert into public.ia_conversaciones
    select (v_conv).*
    on conflict do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select c.id, c.session_id
        into v_conversation_id, v_existing_session
        from public.ia_conversaciones as c
       where c.message_id = v_message_id
          or (v_request_id is not null and c.request_id = v_request_id)
       order by c.fecha desc
       limit 1;

      if v_conversation_id is null or v_existing_session <> v_session_id then
        raise exception using errcode = '23505', message = 'CONVERSATION_IDEMPOTENCY_CONFLICT';
      end if;
    end if;
  end if;

  v_nested_context := coalesce(p_contexto -> 'contexto', '{}'::jsonb);
  v_nested_context := jsonb_set(v_nested_context, '{context_version}', to_jsonb(v_proposed_version), true);

  v_ctx_payload :=
    jsonb_build_object(
      'session_id', v_session_id,
      'canal', 'chatbot',
      'contexto', '{}'::jsonb,
      'updated_at', clock_timestamp(),
      'etapa_conversacion', 'INICIAL',
      'producto_activo_confianza', 0,
      'productos_candidatos', '[]'::jsonb,
      'requiere_aclaracion', false,
      'senal_compra', false,
      'version', v_proposed_version,
      'contrato_version', '46.0',
      'derivacion_activa', false,
      'context_version', v_proposed_version,
      'updated_by', 'n8n_v46'
    )
    || coalesce(p_contexto, '{}'::jsonb)
    || jsonb_build_object(
      'session_id', v_session_id,
      'contexto', v_nested_context,
      'updated_at', clock_timestamp(),
      'version', v_proposed_version,
      'context_version', v_proposed_version,
      'contrato_version', '46.0',
      'ultimo_conversacion_id', v_conversation_id,
      'ultimo_message_id', v_message_id,
      'ultimo_request_id', v_request_id,
      'updated_by', 'n8n_v46'
    );

  v_ctx := jsonb_populate_record(null::public.ia_contexto, v_ctx_payload);

  insert into public.ia_contexto as c (
    session_id, cliente_id, canal, ultima_intencion, ultima_accion, ultima_ruta,
    ultimo_mensaje_cliente, ultima_respuesta_bot, contexto, updated_at,
    etapa_conversacion, producto_activo_id, producto_activo_confianza,
    producto_activo_origen, productos_candidatos,
    atributo_activo, requiere_aclaracion, actividad_activa, problema_activo,
    presupuesto_activo, cantidad_activa, objecion_activa, senal_compra, accion_pendiente,
    version, contrato_version, derivacion_activa, bloquear_respuesta_automatica, motivo_derivacion,
    context_version, ultimo_message_id, ultimo_conversacion_id,
    ultimo_request_id, ultimo_turno_fecha, updated_by
  )
  values (
    v_ctx.session_id, v_ctx.cliente_id, v_ctx.canal, v_ctx.ultima_intencion,
    v_ctx.ultima_accion, v_ctx.ultima_ruta, v_ctx.ultimo_mensaje_cliente,
    v_ctx.ultima_respuesta_bot, v_ctx.contexto, v_ctx.updated_at,
    v_ctx.etapa_conversacion, v_ctx.producto_activo_id,
    v_ctx.producto_activo_confianza, v_ctx.producto_activo_origen,
    v_ctx.productos_candidatos,
    v_ctx.atributo_activo, v_ctx.requiere_aclaracion, v_ctx.actividad_activa,
    v_ctx.problema_activo, v_ctx.presupuesto_activo, v_ctx.cantidad_activa,
    v_ctx.objecion_activa, v_ctx.senal_compra, v_ctx.accion_pendiente,
    v_ctx.version, v_ctx.contrato_version,
    v_ctx.derivacion_activa, v_ctx.bloquear_respuesta_automatica, v_ctx.motivo_derivacion,
    v_ctx.context_version, v_ctx.ultimo_message_id, v_ctx.ultimo_conversacion_id,
    v_ctx.ultimo_request_id, v_ctx.ultimo_turno_fecha, v_ctx.updated_by
  )
  on conflict (session_id) do update set
    cliente_id = excluded.cliente_id,
    canal = excluded.canal,
    ultima_intencion = excluded.ultima_intencion,
    ultima_accion = excluded.ultima_accion,
    ultima_ruta = excluded.ultima_ruta,
    ultimo_mensaje_cliente = excluded.ultimo_mensaje_cliente,
    ultima_respuesta_bot = excluded.ultima_respuesta_bot,
    contexto = excluded.contexto,
    updated_at = excluded.updated_at,
    etapa_conversacion = excluded.etapa_conversacion,
    producto_activo_id = excluded.producto_activo_id,
    producto_activo_confianza = excluded.producto_activo_confianza,
    producto_activo_origen = excluded.producto_activo_origen,
    productos_candidatos = excluded.productos_candidatos,
    atributo_activo = excluded.atributo_activo,
    requiere_aclaracion = excluded.requiere_aclaracion,
    actividad_activa = excluded.actividad_activa,
    problema_activo = excluded.problema_activo,
    presupuesto_activo = excluded.presupuesto_activo,
    cantidad_activa = excluded.cantidad_activa,
    objecion_activa = excluded.objecion_activa,
    senal_compra = excluded.senal_compra,
    accion_pendiente = excluded.accion_pendiente,
    version = excluded.version,
    contrato_version = excluded.contrato_version,
    derivacion_activa = excluded.derivacion_activa,
    bloquear_respuesta_automatica = excluded.bloquear_respuesta_automatica,
    motivo_derivacion = excluded.motivo_derivacion,
    context_version = excluded.context_version,
    ultimo_message_id = excluded.ultimo_message_id,
    ultimo_conversacion_id = excluded.ultimo_conversacion_id,
    ultimo_request_id = excluded.ultimo_request_id,
    ultimo_turno_fecha = excluded.ultimo_turno_fecha,
    updated_by = excluded.updated_by;

  update public.ia_sesiones as s
     set cliente_id = coalesce(s.cliente_id, v_ctx.cliente_id),
         canal = coalesce(v_ctx.canal, s.canal),
         etapa_comercial = case
           when upper(coalesce(v_ctx.etapa_conversacion, '')) = 'CIERRE' then 'CIERRE'
           when upper(coalesce(v_ctx.etapa_conversacion, '')) = 'EVALUACION' then 'EVALUACION'
           when upper(coalesce(v_ctx.etapa_conversacion, '')) = 'DESCUBRIMIENTO' then 'DESCUBRIMIENTO'
           when upper(coalesce(v_ctx.etapa_conversacion, '')) in ('FIT_READY','OFFER_READY','EVALUATING_PURCHASE','CLOSE_READY','PURCHASE')
             then upper(v_ctx.etapa_conversacion)
           when coalesce(v_nested_context -> 'spin_estado' -> 'problemas', '[]'::jsonb) <> '[]'::jsonb
             or coalesce(v_nested_context -> 'spin_estado' -> 'implicaciones', '[]'::jsonb) <> '[]'::jsonb
             then 'DESCUBRIMIENTO'
           else 'NUEVO'
         end,
         resumen = concat_ws(' | ',
           nullif('Producto: ' || coalesce(v_nested_context -> 'product' ->> 'activeProduct', v_nested_context -> 'producto_activo' ->> 'nombre_corto', v_nested_context -> 'producto_activo' ->> 'modelo', ''), 'Producto: '),
           nullif('Actividad: ' || coalesce(v_nested_context -> 'customer' ->> 'useCase', v_nested_context ->> 'actividad_activa', ''), 'Actividad: '),
           nullif('Problema: ' || coalesce(v_nested_context -> 'customer' ->> 'problem', v_nested_context ->> 'problema_activo', ''), 'Problema: '),
           nullif('Siguiente: ' || coalesce(v_ctx.ultima_accion, ''), 'Siguiente: ')
         ),
         version = v_proposed_version
   where s.session_id = v_session_id;

  return jsonb_build_object(
    'ok', true,
    'status', 'SAVED',
    'session_id', v_session_id,
    'conversation_id', v_conversation_id,
    'context_version', v_proposed_version,
    'contract_version', '46.0'
  );
end;
$$;

create or replace function public.ia_persistir_turno_atomico(
  p_owner text,
  p_conversacion jsonb,
  p_contexto jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $$
begin
  return public.ia_persistir_turno_atomico_v46(p_owner,p_conversacion,p_contexto);
end;
$$;
