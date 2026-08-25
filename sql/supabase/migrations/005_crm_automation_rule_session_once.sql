begin;

-- V2 semantics: follow-up timers start after a successfully persisted BOT reply.
alter table public.crm_automation_rules
  drop constraint if exists crm_automation_rules_event_type_check;

alter table public.crm_automation_rules
  add constraint crm_automation_rules_event_type_check
  check (event_type in ('CUSTOMER_MESSAGE_RECEIVED','BOT_MESSAGE_SENT'));

update public.crm_automation_rules
   set event_type = 'BOT_MESSAGE_SENT',
       updated_at = now()
 where event_type = 'CUSTOMER_MESSAGE_RECEIVED';

-- Existing jobs remain immutable audit history; normalize only pending jobs so the UI
-- and worker report the current trigger semantics consistently.
update public.crm_automation_jobs
   set event_type = 'BOT_MESSAGE_SENT',
       updated_at = now()
 where event_type = 'CUSTOMER_MESSAGE_RECEIVED'
   and status = 'PENDING';

create table if not exists public.crm_automation_rule_session_guard (
  rule_id uuid not null references public.crm_automation_rules(id) on delete cascade,
  session_id text not null,
  created_at timestamptz not null default now(),
  primary key (rule_id, session_id)
);

alter table public.crm_automation_rule_session_guard enable row level security;
grant select,insert,update,delete on public.crm_automation_rule_session_guard to service_role;

-- Historical jobs count as prior use. This means a rule that already ran/cancelled/failed
-- in a conversation is never scheduled again in that same conversation.
insert into public.crm_automation_rule_session_guard(rule_id, session_id, created_at)
select distinct on (j.rule_id, j.session_id)
       j.rule_id,
       j.session_id,
       coalesce(j.created_at, now())
  from public.crm_automation_jobs j
 order by j.rule_id, j.session_id, j.created_at asc
on conflict (rule_id, session_id) do nothing;

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

  -- The guard insert and job insert are one database transaction. If job creation fails,
  -- PostgreSQL rolls the guard insert back as well.
  return query
  with acquired as (
    insert into public.crm_automation_rule_session_guard(rule_id, session_id)
    values (p_rule_id, p_session_id)
    on conflict (rule_id, session_id) do nothing
    returning 1
  ), inserted as (
    insert into public.crm_automation_jobs(
      rule_id, session_id, event_type, basis_message_id, recipient, execute_at, status
    )
    select p_rule_id, p_session_id, p_event_type, nullif(btrim(p_basis_message_id), ''), p_recipient, p_execute_at, 'PENDING'
      from acquired
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
grant execute on function public.crm_schedule_automation_job_once(uuid,text,text,text,text,timestamptz) to service_role;

commit;
