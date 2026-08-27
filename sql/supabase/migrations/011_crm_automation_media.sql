begin;

alter table public.crm_automation_rules
  add column if not exists media_url text;

alter table public.crm_automation_rules
  drop constraint if exists crm_automation_rules_action_type_check;

alter table public.crm_automation_rules
  add constraint crm_automation_rules_action_type_check
  check (action_type in ('SEND_TEXT','SEND_IMAGE_PRODUCT_AUTO','SEND_IMAGE_CUSTOM_URL'));

alter table public.crm_automation_rules
  drop constraint if exists crm_automation_rules_media_url_check;

alter table public.crm_automation_rules
  add constraint crm_automation_rules_media_url_check
  check (
    action_type <> 'SEND_IMAGE_CUSTOM_URL'
    or (media_url is not null and btrim(media_url) ~ '^https://')
  );

alter table public.crm_automation_jobs
  add column if not exists action_type_snapshot text,
  add column if not exists media_url_snapshot text,
  add column if not exists media_type_snapshot text,
  add column if not exists media_product_id_snapshot text,
  add column if not exists media_source_snapshot text;

update public.crm_automation_jobs j
   set action_type_snapshot = coalesce(j.action_type_snapshot, r.action_type),
       media_url_snapshot = coalesce(j.media_url_snapshot, r.media_url)
  from public.crm_automation_rules r
 where r.id = j.rule_id
   and (j.action_type_snapshot is null or j.media_url_snapshot is null);

drop function if exists public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz);

create function public.crm_schedule_automation_job_once(
  p_rule_id uuid,
  p_session_id text,
  p_event_type text,
  p_basis_message_id text,
  p_recipient text,
  p_execute_at timestamptz,
  p_action_type text,
  p_media_url text,
  p_media_type text,
  p_media_product_id text,
  p_media_source text
)
returns table (
  id uuid,
  rule_id uuid,
  session_id text,
  event_type text,
  basis_message_id text,
  recipient text,
  execute_at timestamptz,
  status text,
  attempt_count integer,
  lease_owner text,
  lease_until timestamptz,
  action_type text,
  media_url text,
  media_type text,
  media_product_id text,
  media_source text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_rule_id is null then raise exception 'RULE_ID_REQUIRED'; end if;
  if nullif(btrim(p_session_id), '') is null then raise exception 'SESSION_ID_REQUIRED'; end if;
  if nullif(btrim(p_recipient), '') is null then raise exception 'RECIPIENT_REQUIRED'; end if;
  if p_event_type <> 'BOT_MESSAGE_SENT' then raise exception 'AUTOMATION_EVENT_INVALID'; end if;
  if p_execute_at is null then raise exception 'EXECUTE_AT_REQUIRED'; end if;
  if p_action_type not in ('SEND_TEXT','SEND_IMAGE_PRODUCT_AUTO','SEND_IMAGE_CUSTOM_URL') then raise exception 'AUTOMATION_ACTION_INVALID'; end if;

  return query
  with acquired as (
    insert into public.crm_automation_rule_session_guard(rule_id, session_id)
    values (p_rule_id, p_session_id)
    on conflict on constraint crm_automation_rule_session_guard_pkey do nothing
    returning 1
  ), inserted as (
    insert into public.crm_automation_jobs(
      rule_id,session_id,event_type,basis_message_id,recipient,execute_at,status,
      message_template_snapshot,priority_snapshot,action_type_snapshot,
      media_url_snapshot,media_type_snapshot,media_product_id_snapshot,media_source_snapshot
    )
    select p_rule_id,p_session_id,p_event_type,nullif(btrim(p_basis_message_id),''),p_recipient,p_execute_at,'PENDING',
           r.message_template,r.priority,r.action_type,
           case when r.action_type='SEND_IMAGE_CUSTOM_URL' then coalesce(nullif(btrim(p_media_url),''),r.media_url) else nullif(btrim(p_media_url),'') end,
           nullif(btrim(p_media_type),''),nullif(btrim(p_media_product_id),''),nullif(btrim(p_media_source),'')
      from acquired
      join public.crm_automation_rules r on r.id=p_rule_id
     where r.action_type=p_action_type
    returning crm_automation_jobs.*
  )
  select j.id,j.rule_id,j.session_id,j.event_type,j.basis_message_id,j.recipient,j.execute_at,j.status,
         j.attempt_count,j.lease_owner,j.lease_until,
         coalesce(j.action_type_snapshot,'SEND_TEXT'),j.media_url_snapshot,j.media_type_snapshot,j.media_product_id_snapshot,j.media_source_snapshot
    from inserted j;
end;
$$;

revoke all on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz,text,text,text,text,text) from public;
revoke all on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz,text,text,text,text,text) from anon;
revoke all on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz,text,text,text,text,text) from authenticated;
grant execute on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz,text,text,text,text,text) to service_role;

drop function if exists public.crm_claim_due_automation_jobs(text,integer,integer);

create function public.crm_claim_due_automation_jobs(
  p_worker_id text,
  p_batch_size integer default 20,
  p_lease_seconds integer default 60
)
returns table (
  id uuid,
  rule_id uuid,
  session_id text,
  event_type text,
  basis_message_id text,
  recipient text,
  execute_at timestamptz,
  status text,
  attempt_count integer,
  lease_owner text,
  lease_until timestamptz,
  message_template text,
  action_type text,
  media_url text,
  media_type text,
  media_product_id text,
  media_source text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then raise exception 'WORKER_ID_REQUIRED'; end if;

  update public.crm_automation_jobs as j
     set status='AMBIGUOUS',last_error='WORKER_LEASE_EXPIRED_AFTER_CLAIM',cancel_reason='WORKER_LEASE_EXPIRED_AFTER_CLAIM',
         lease_owner=null,lease_until=null,updated_at=now()
   where j.status='PROCESSING' and j.lease_until is not null and j.lease_until<now();

  return query
  with due as (
    select j.id
      from public.crm_automation_jobs j
      join public.crm_automation_rules r on r.id=j.rule_id
     where j.status='PENDING' and j.execute_at<=now() and r.active=true
     order by j.execute_at asc,coalesce(j.priority_snapshot,r.priority) asc,j.created_at asc
     for update of j skip locked
     limit greatest(1,least(coalesce(p_batch_size,20),200))
  ), claimed as (
    update public.crm_automation_jobs j
       set status='PROCESSING',attempt_count=j.attempt_count+1,lease_owner=p_worker_id,
           lease_until=now()+make_interval(secs=>greatest(1,least(coalesce(p_lease_seconds,60),3600))),updated_at=now()
      from due where j.id=due.id returning j.*
  )
  select c.id,c.rule_id,c.session_id,c.event_type,c.basis_message_id,c.recipient,c.execute_at,c.status,c.attempt_count,c.lease_owner,c.lease_until,
         coalesce(c.message_template_snapshot,r.message_template),coalesce(c.action_type_snapshot,r.action_type),
         c.media_url_snapshot,c.media_type_snapshot,c.media_product_id_snapshot,c.media_source_snapshot
    from claimed c join public.crm_automation_rules r on r.id=c.rule_id
   order by c.execute_at asc,coalesce(c.priority_snapshot,r.priority) asc;
end;
$$;

revoke all on function public.crm_claim_due_automation_jobs(text,integer,integer) from public;
revoke all on function public.crm_claim_due_automation_jobs(text,integer,integer) from anon;
revoke all on function public.crm_claim_due_automation_jobs(text,integer,integer) from authenticated;
grant execute on function public.crm_claim_due_automation_jobs(text,integer,integer) to service_role;

commit;
