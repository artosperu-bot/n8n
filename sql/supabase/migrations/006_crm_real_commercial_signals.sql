-- STECH data contract v46: CRM reads real commercial signals.
-- Keeps the public crm_api signature, but removes probability/cost authority.

create or replace function public.crm_api_v46(
  p_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','extensions'
as $$
declare
  v_expected bytea;
  v_action text:=lower(trim(coalesce(p_action,'')));
  v_limit integer:=40;
  v_days integer:=30;
  v_mode text;
  v_search text;
  v_session_id text;
  v_content text;
  v_message_id text;
  v_reason text;
  v_actor_email text;
  v_actor_name text;
  v_version bigint;
  v_result jsonb;
  v_session record;
  v_message record;
begin
  select c.token_hash into v_expected
  from private.crm_api_credentials c
  where c.credential_id='sites_crm';

  if v_expected is null
     or extensions.digest(coalesce(p_token,''),'sha256')<>v_expected then
    raise exception 'CRM_API_UNAUTHORIZED' using errcode='42501';
  end if;

  if v_action='list_sessions' then
    begin
      v_limit:=least(greatest(coalesce((p_payload->>'limit')::integer,40),1),100);
    exception when others then v_limit:=40;
    end;
    v_mode:=nullif(upper(trim(coalesce(p_payload->>'mode',''))),'ALL');
    v_search:=nullif(trim(coalesce(p_payload->>'search','')),'');

    select coalesce(jsonb_agg(to_jsonb(q) order by q.last_message_at desc nulls last),'[]'::jsonb)
    into v_result
    from (
      select
        s.session_id,s.canal,s.estado,s.etapa_comercial,
        case
          when coalesce(ctx.contexto #>> '{commercial,interestLevel}',ctx.contexto->>'levelOfInterest','') ~ '^[0-9]+([.][0-9]+)?$'
          then coalesce(ctx.contexto #>> '{commercial,interestLevel}',ctx.contexto->>'levelOfInterest')::numeric
          else 0
        end as nivel_interes,
        coalesce(ctx.senal_compra,false) as senal_compra,
        null::numeric as probabilidad_compra,
        s.version,s.modo_atencion,s.motivo_derivacion,s.fecha_inicio,
        s.modo_actualizado_at,s.solicitud_asesor_at,s.tomada_at,
        s.devuelta_bot_at,s.cerrada_at,c.nombre as cliente_nombre,
        c.telefono as cliente_telefono,c.email as cliente_email,
        coalesce(cm.contenido,hist.respuesta_bot,hist.mensaje_cliente) as last_message,
        coalesce(cm.emisor,case when hist.respuesta_bot is not null then 'BOT' else 'CLIENTE' end) as last_emisor,
        coalesce(cm.fecha,hist.fecha,s.modo_actualizado_at,s.fecha_inicio) as last_message_at,
        coalesce(mc.total,hist.total,0)::integer as message_count,
        ctx.producto_activo_id,cp.nombre_corto as producto_nombre,
        ctx.actividad_activa,ctx.problema_activo,ctx.atributo_activo,
        ctx.etapa_conversacion,ctx.memoria_resumen
      from public.ia_sesiones s
      left join public.ia_clientes c on c.id=s.cliente_id
      left join public.ia_contexto ctx on ctx.session_id=s.session_id
      left join public.catalogo_productos cp on cp.producto_id=ctx.producto_activo_id
      left join lateral(
        select m.contenido,m.emisor,m.fecha
        from public.crm_mensajes m
        where m.session_id=s.session_id
        order by m.fecha desc,m.id desc limit 1
      ) cm on true
      left join lateral(
        select ic.mensaje_cliente,ic.respuesta_bot,ic.fecha,
               (select count(*)*2 from public.ia_conversaciones ic2 where ic2.session_id=s.session_id) as total
        from public.ia_conversaciones ic
        where ic.session_id=s.session_id
        order by ic.fecha desc,ic.id desc limit 1
      ) hist on cm.fecha is null
      left join lateral(
        select count(*) as total from public.crm_mensajes m2
        where m2.session_id=s.session_id
      ) mc on true
      where (v_mode is null or s.modo_atencion=v_mode)
        and (cm.fecha is not null or hist.fecha is not null or s.modo_atencion<>'BOT')
        and (
          v_search is null
          or s.session_id ilike '%'||v_search||'%'
          or coalesce(c.nombre,'') ilike '%'||v_search||'%'
          or coalesce(c.telefono,'') ilike '%'||v_search||'%'
          or coalesce(cm.contenido,hist.mensaje_cliente,'') ilike '%'||v_search||'%'
          or coalesce(cp.nombre_corto,'') ilike '%'||v_search||'%'
        )
      order by coalesce(cm.fecha,hist.fecha,s.modo_actualizado_at,s.fecha_inicio) desc
      limit v_limit
    ) q;

    return jsonb_build_object(
      'sessions',v_result,
      'stats',jsonb_build_object(
        'waiting',(select count(*) from public.ia_sesiones where modo_atencion='ESPERANDO_ASESOR'),
        'human',(select count(*) from public.ia_sesiones where modo_atencion='HUMANO'),
        'bot',(select count(*) from public.ia_sesiones where modo_atencion='BOT'),
        'closed',(select count(*) from public.ia_sesiones where modo_atencion='CERRADO')
      )
    );

  elsif v_action='get_messages' then
    v_session_id:=nullif(trim(coalesce(p_payload->>'session_id','')),'');
    if v_session_id is null then
      raise exception 'SESSION_ID_REQUIRED' using errcode='22023';
    end if;

    if exists(select 1 from public.crm_mensajes where session_id=v_session_id) then
      select coalesce(jsonb_agg(to_jsonb(q) order by q.fecha,q.id),'[]'::jsonb)
      into v_result
      from (
        select m.id::text as id,m.session_id,m.message_id,m.emisor,m.contenido,
               m.canal,m.metadata,m.fecha,m.editado_at
        from public.crm_mensajes m
        where m.session_id=v_session_id
        order by m.fecha asc,m.id asc limit 400
      ) q;
    else
      select coalesce(jsonb_agg(x.item order by x.fecha,x.orden),'[]'::jsonb)
      into v_result
      from (
        select ic.fecha,1 as orden,jsonb_build_object(
          'id',ic.id::text||':cliente','session_id',ic.session_id,
          'message_id',ic.message_id,'emisor','CLIENTE','contenido',ic.mensaje_cliente,
          'canal','historico','metadata',jsonb_build_object('source','ia_conversaciones'),
          'fecha',ic.fecha
        ) as item
        from public.ia_conversaciones ic where ic.session_id=v_session_id
        union all
        select ic.fecha,2 as orden,jsonb_build_object(
          'id',ic.id::text||':bot','session_id',ic.session_id,
          'message_id','bot:'||coalesce(ic.message_id,ic.id::text),'emisor','BOT',
          'contenido',ic.respuesta_bot,'canal','historico',
          'metadata',jsonb_build_object('source','ia_conversaciones'),
          'fecha',ic.fecha+interval '1 millisecond'
        ) as item
        from public.ia_conversaciones ic
        where ic.session_id=v_session_id and nullif(ic.respuesta_bot,'') is not null
      ) x;
    end if;

    return jsonb_build_object(
      'messages',v_result,
      'session',(
        select to_jsonb(qs) from (
          select s.session_id,s.canal,s.estado,s.etapa_comercial,
                 case
                   when coalesce(ctx.contexto #>> '{commercial,interestLevel}',ctx.contexto->>'levelOfInterest','') ~ '^[0-9]+([.][0-9]+)?$'
                   then coalesce(ctx.contexto #>> '{commercial,interestLevel}',ctx.contexto->>'levelOfInterest')::numeric
                   else 0
                 end as nivel_interes,
                 coalesce(ctx.senal_compra,false) as senal_compra,
                 null::numeric as probabilidad_compra,
                 s.version,s.modo_atencion,s.motivo_derivacion,s.fecha_inicio,
                 s.modo_actualizado_at,s.solicitud_asesor_at,s.tomada_at,
                 s.devuelta_bot_at,s.cerrada_at,c.nombre as cliente_nombre,
                 c.telefono as cliente_telefono,c.email as cliente_email,
                 ctx.producto_activo_id,cp.nombre_corto as producto_nombre,
                 ctx.actividad_activa,ctx.problema_activo,ctx.atributo_activo,
                 ctx.etapa_conversacion,ctx.memoria_resumen
          from public.ia_sesiones s
          left join public.ia_clientes c on c.id=s.cliente_id
          left join public.ia_contexto ctx on ctx.session_id=s.session_id
          left join public.catalogo_productos cp on cp.producto_id=ctx.producto_activo_id
          where s.session_id=v_session_id
        ) qs
      )
    );

  elsif v_action='dashboard' then
    begin
      v_days:=least(greatest(coalesce((p_payload->>'days')::integer,30),1),365);
    exception when others then v_days:=30;
    end;

    return jsonb_build_object(
      'period_days',v_days,
      'summary',jsonb_build_object(
        'turns',(select count(*) from public.ia_conversaciones where fecha>=now()-(v_days||' days')::interval),
        'sessions',(select count(distinct session_id) from public.ia_conversaciones where fecha>=now()-(v_days||' days')::interval),
        'tokens',(select coalesce(sum(coalesce(tokens_entrada,0)+coalesce(tokens_salida,0)+coalesce(tokens_cacheados,0)),0) from public.ia_metricas_tokens where creado_en>=now()-(v_days||' days')::interval),
        'cost_usd',null,
        'purchase_signals',(select count(*) from public.ia_contexto where coalesce(senal_compra,false)=true and coalesce(ultimo_turno_fecha,updated_at)>=now()-(v_days||' days')::interval),
        'high_interest',(select count(*) from public.ia_contexto where
          case
            when coalesce(contexto #>> '{commercial,interestLevel}',contexto->>'levelOfInterest','') ~ '^[0-9]+([.][0-9]+)?$'
            then coalesce(contexto #>> '{commercial,interestLevel}',contexto->>'levelOfInterest')::numeric
            else 0
          end >= 60
          and coalesce(ultimo_turno_fecha,updated_at)>=now()-(v_days||' days')::interval),
        'buying_signals',(select count(*) from public.ia_contexto where coalesce(senal_compra,false)=true and coalesce(ultimo_turno_fecha,updated_at)>=now()-(v_days||' days')::interval)
      ),
      'products',coalesce((
        select jsonb_agg(to_jsonb(p) order by p.turns desc)
        from (
          select coalesce(cp.nombre_corto,max(ic.producto_detectado),ic.producto_id_resuelto,'Sin identificar') as product,
                 count(*)::integer as turns,count(distinct ic.session_id)::integer as sessions
          from public.ia_conversaciones ic
          left join public.catalogo_productos cp on cp.producto_id=ic.producto_id_resuelto
          where ic.fecha>=now()-(v_days||' days')::interval
            and coalesce(ic.producto_id_resuelto,ic.producto_detectado) is not null
          group by ic.producto_id_resuelto,cp.nombre_corto
          order by count(*) desc limit 8
        ) p
      ),'[]'::jsonb),
      'attributes',coalesce((
        select jsonb_agg(to_jsonb(a) order by a.total desc)
        from (
          select atributo_detectado as attribute,count(*)::integer as total
          from public.ia_conversaciones
          where fecha>=now()-(v_days||' days')::interval
            and nullif(atributo_detectado,'') is not null
          group by atributo_detectado order by count(*) desc limit 8
        ) a
      ),'[]'::jsonb),
      'questions',coalesce((
        select jsonb_agg(to_jsonb(f) order by f.total desc,f.question)
        from (
          select lower(trim(mensaje_cliente)) as question,count(*)::integer as total
          from public.ia_conversaciones
          where fecha>=now()-(v_days||' days')::interval
            and length(trim(coalesce(mensaje_cliente,'')))>=7
            and coalesce(intencion,'')<>'APORTAR_DATO_SPIN'
          group by lower(trim(mensaje_cliente))
          order by count(*) desc,max(fecha) desc limit 10
        ) f
      ),'[]'::jsonb),
      'routes',coalesce((
        select jsonb_agg(to_jsonb(r) order by r.total desc)
        from (
          select coalesce(ruta,'SIN_RUTA') as route,count(*)::integer as total
          from public.ia_conversaciones
          where fecha>=now()-(v_days||' days')::interval
          group by coalesce(ruta,'SIN_RUTA') order by count(*) desc
        ) r
      ),'[]'::jsonb)
    );

  elsif v_action='change_mode' then
    v_session_id:=nullif(trim(coalesce(p_payload->>'session_id','')),'');
    v_mode:=upper(trim(coalesce(p_payload->>'mode','')));
    v_reason:=nullif(trim(coalesce(p_payload->>'reason','')),'');
    v_actor_email:=nullif(trim(coalesce(p_payload->>'actor_email','')),'');
    v_version:=nullif(p_payload->>'version','')::bigint;

    if v_session_id is null or v_mode<>all(array['BOT','ESPERANDO_ASESOR','HUMANO','CERRADO']) then
      raise exception 'INVALID_MODE_CHANGE' using errcode='22023';
    end if;

    select f.* into v_session
    from public.crm_cambiar_modo_atencion(
      v_session_id,v_mode,null,
      concat_ws(' · ',v_reason,case when v_actor_email is not null then 'CRM '||v_actor_email end),
      v_version
    ) f;

    return jsonb_build_object('session_id',v_session.session_id,'modo_atencion',v_session.modo_atencion,'version',v_session.version);

  elsif v_action='send_human' then
    v_session_id:=nullif(trim(coalesce(p_payload->>'session_id','')),'');
    v_content:=nullif(trim(coalesce(p_payload->>'content','')),'');
    v_actor_email:=nullif(trim(coalesce(p_payload->>'actor_email','')),'');
    v_actor_name:=nullif(trim(coalesce(p_payload->>'actor_name','')),'');
    v_message_id:=coalesce(nullif(trim(coalesce(p_payload->>'message_id','')),''),'human:'||gen_random_uuid()::text);

    if v_session_id is null or v_content is null then
      raise exception 'MESSAGE_REQUIRED' using errcode='22023';
    end if;

    select s.* into v_session from public.ia_sesiones s
    where s.session_id=v_session_id for update;
    if not found then raise exception 'SESSION_NOT_FOUND' using errcode='P0002'; end if;
    if v_session.modo_atencion='CERRADO' then raise exception 'SESSION_CLOSED' using errcode='22023'; end if;

    if v_session.modo_atencion<>'HUMANO' then
      perform 1 from public.crm_cambiar_modo_atencion(
        v_session_id,'HUMANO',null,concat_ws(' · ','Tomada desde CRM',v_actor_email),v_session.version
      );
    end if;

    insert into public.crm_mensajes(session_id,message_id,emisor,contenido,canal,metadata)
    values(v_session_id,v_message_id,'ASESOR',v_content,'crm',
      jsonb_strip_nulls(jsonb_build_object('actor_email',v_actor_email,'actor_name',v_actor_name,'source','sites_crm')))
    on conflict do nothing returning * into v_message;

    if v_message.id is null then
      select m.* into v_message from public.crm_mensajes m
      where m.session_id=v_session_id and m.message_id=v_message_id
      order by m.fecha desc limit 1;
    end if;
    return jsonb_build_object('message',to_jsonb(v_message));
  else
    raise exception 'UNKNOWN_CRM_ACTION' using errcode='22023';
  end if;
end;
$$;

create or replace function public.crm_api(
  p_token text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public','private','extensions'
as $$
begin
  return public.crm_api_v46(p_token,p_action,p_payload);
end;
$$;
