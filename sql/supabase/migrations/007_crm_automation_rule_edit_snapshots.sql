begin;

-- Editing a rule only affects future jobs. Pending/existing jobs keep the content
-- and ordering priority that were effective when they were scheduled.
alter table public.crm_automation_jobs
  add column if not exists message_template_snapshot text,
  add column if not exists priority_snapshot integer;

-- Best-effort backfill for jobs created before snapshots existed.
update public.crm_automation_jobs j
   set message_template_snapshot = coalesce(j.message_template_snapshot, r.message_template),
       priority_snapshot = coalesce(j.priority_snapshot, r.priority)
  from public.crm_automation_rules r
 where r.id = j.rule_id
   and (j.message_template_snapshot is null or j.priority_snapshot is null);

create or replace function public.crm_schedule_automation_job_once(
  p_rule_id uuid,
  p_session_id text,
  p_event_type text,
  p_basis_message_id text,
  p_recipient text,
  p_execute_at timestamptz
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
  lease_until timestamptz
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

  return query
  with acquired as (
    insert into public.crm_automation_rule_session_guard(rule_id, session_id)
    values (p_rule_id, p_session_id)
    on conflict on constraint crm_automation_rule_session_guard_pkey do nothing
    returning 1
  ), inserted as (
    insert into public.crm_automation_jobs(
      rule_id,
      session_id,
      event_type,
      basis_message_id,
      recipient,
      execute_at,
      status,
      message_template_snapshot,
      priority_snapshot
    )
    select p_rule_id,
           p_session_id,
           p_event_type,
           nullif(btrim(p_basis_message_id), ''),
           p_recipient,
           p_execute_at,
           'PENDING',
           r.message_template,
           r.priority
      from acquired
      join public.crm_automation_rules r on r.id = p_rule_id
    returning crm_automation_jobs.*
  )
  select j.id,
         j.rule_id,
         j.session_id,
         j.event_type,
         j.basis_message_id,
         j.recipient,
         j.execute_at,
         j.status,
         j.attempt_count,
         j.lease_owner,
         j.lease_until
    from inserted j;
end;
$$;

revoke all on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz) from public;
revoke all on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz) from anon;
revoke all on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz) from authenticated;
grant execute on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz) to service_role;

create or replace function public.crm_claim_due_automation_jobs(
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
  message_template text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(p_worker_id), '') is null then
    raise exception 'WORKER_ID_REQUIRED';
  end if;

  update public.crm_automation_jobs as j
     set status = 'AMBIGUOUS',
         last_error = 'WORKER_LEASE_EXPIRED_AFTER_CLAIM',
         cancel_reason = 'WORKER_LEASE_EXPIRED_AFTER_CLAIM',
         lease_owner = null,
         lease_until = null,
         updated_at = now()
   where j.status = 'PROCESSING'
     and j.lease_until is not null
     and j.lease_until < now();

  return query
  with due as (
    select j.id
      from public.crm_automation_jobs j
      join public.crm_automation_rules r on r.id = j.rule_id
     where j.status = 'PENDING'
       and j.execute_at <= now()
       and r.active = true
     order by j.execute_at asc,
              coalesce(j.priority_snapshot, r.priority) asc,
              j.created_at asc
     for update of j skip locked
     limit greatest(1, least(coalesce(p_batch_size, 20), 200))
  ), claimed as (
    update public.crm_automation_jobs as j
       set status = 'PROCESSING',
           attempt_count = j.attempt_count + 1,
           lease_owner = p_worker_id,
           lease_until = now() + make_interval(secs => greatest(1, least(coalesce(p_lease_seconds, 60), 3600))),
           updated_at = now()
      from due
     where j.id = due.id
    returning j.*
  )
  select c.id,
         c.rule_id,
         c.session_id,
         c.event_type,
         c.basis_message_id,
         c.recipient,
         c.execute_at,
         c.status,
         c.attempt_count,
         c.lease_owner,
         c.lease_until,
         coalesce(c.message_template_snapshot, r.message_template) as message_template
    from claimed c
    join public.crm_automation_rules r on r.id = c.rule_id
   order by c.execute_at asc,
            coalesce(c.priority_snapshot, r.priority) asc;
end;
$$;

-- Worker claim remains backend-only.
revoke all on function public.crm_claim_due_automation_jobs(text,integer,integer) from public;
revoke all on function public.crm_claim_due_automation_jobs(text,integer,integer) from anon;
revoke all on function public.crm_claim_due_automation_jobs(text,integer,integer) from authenticated;
grant execute on function public.crm_claim_due_automation_jobs(text,integer,integer) to service_role;

commit;
