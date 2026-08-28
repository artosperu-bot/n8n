begin;

create extension if not exists pgcrypto;

create table if not exists public.crm_automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text not null check (event_type in ('CUSTOMER_MESSAGE_RECEIVED')),
  delay_seconds integer not null check (delay_seconds >= 0),
  action_type text not null default 'SEND_TEXT' check (action_type in ('SEND_TEXT')),
  message_template text not null check (length(btrim(message_template)) > 0),
  active boolean not null default true,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_automation_jobs (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.crm_automation_rules(id) on delete cascade,
  session_id text not null,
  event_type text not null,
  basis_message_id text null,
  recipient text not null,
  execute_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING','PROCESSING','SENT','CANCELLED','SKIPPED','FAILED','AMBIGUOUS')),
  cancel_reason text null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner text null,
  lease_until timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_automation_executions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.crm_automation_jobs(id) on delete cascade,
  session_id text not null,
  provider_message_id text null,
  outcome text not null check (outcome in ('SENT','FAILED','AMBIGUOUS','SKIPPED','CANCELLED')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_crm_automation_job_basis
  on public.crm_automation_jobs(rule_id, session_id, basis_message_id)
  where basis_message_id is not null;

create index if not exists ix_crm_automation_jobs_due
  on public.crm_automation_jobs(status, execute_at)
  where status in ('PENDING','PROCESSING');

create index if not exists ix_crm_automation_jobs_session
  on public.crm_automation_jobs(session_id, created_at desc);

create index if not exists ix_crm_automation_rules_event_active
  on public.crm_automation_rules(event_type, active, priority);

create unique index if not exists ux_crm_automation_execution_sent
  on public.crm_automation_executions(job_id)
  where outcome = 'SENT';

alter table public.crm_automation_rules enable row level security;
alter table public.crm_automation_jobs enable row level security;
alter table public.crm_automation_executions enable row level security;

grant select,insert,update,delete on public.crm_automation_rules to service_role;
grant select,insert,update,delete on public.crm_automation_jobs to service_role;
grant select,insert,update,delete on public.crm_automation_executions to service_role;

create or replace function public.crm_cancel_pending_automation_jobs(
  p_session_id text,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.crm_automation_jobs as j
     set status = 'CANCELLED',
         cancel_reason = coalesce(nullif(btrim(p_reason), ''), 'CANCELLED'),
         lease_owner = null,
         lease_until = null,
         updated_at = now()
   where j.session_id = p_session_id
     and j.status = 'PENDING';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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

  -- Conservative at-most-once policy: an expired PROCESSING lease is not
  -- automatically retried because the provider may already have accepted it.
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
     order by j.execute_at asc, r.priority asc, j.created_at asc
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
         r.message_template
    from claimed c
    join public.crm_automation_rules r on r.id = c.rule_id
   order by c.execute_at asc, r.priority asc;
end;
$$;

create or replace function public.crm_cancel_automation_on_attention_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if coalesce(new.modo_atencion, 'BOT') = 'BOT' then
    return new;
  end if;

  if old.modo_atencion is not distinct from new.modo_atencion then
    return new;
  end if;

  v_reason := case upper(coalesce(new.modo_atencion, ''))
    when 'HUMANO' then 'HUMAN_TAKEOVER'
    when 'ESPERANDO_ASESOR' then 'WAITING_ADVISOR'
    when 'CERRADO' then 'SESSION_CLOSED'
    else 'ATTENTION_MODE_CHANGED'
  end;

  perform public.crm_cancel_pending_automation_jobs(new.session_id, v_reason);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.ia_sesiones') is not null then
    execute 'drop trigger if exists trg_crm_cancel_automation_on_attention_change on public.ia_sesiones';
    execute 'create trigger trg_crm_cancel_automation_on_attention_change after update of modo_atencion on public.ia_sesiones for each row execute function public.crm_cancel_automation_on_attention_change()';
  end if;
end;
$$;

revoke all on function public.crm_claim_due_automation_jobs(text,integer,integer) from public;
revoke all on function public.crm_cancel_pending_automation_jobs(text,text) from public;

grant execute on function public.crm_claim_due_automation_jobs(text,integer,integer) to service_role;
grant execute on function public.crm_cancel_pending_automation_jobs(text,text) to service_role;

commit;
