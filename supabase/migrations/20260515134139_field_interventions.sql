-- Migration appliquée en production le 2026-05-15 (version 20260515134139), recopiée telle quelle depuis
-- supabase_migrations.schema_migrations de la prod lors du réalignement du 2026-10-22.

create table if not exists public.field_interventions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  created_at timestamptz not null default now(),
  technician_name text not null,
  technician_contact text,
  category text not null check (category in ('intervention','incident','controle','autre')),
  severity text not null check (severity in ('info','warning','error')),
  message text,
  status text not null default 'open' check (status in ('open','resolved')),
  resolved_at timestamptz,
  resolved_by_recipient_id uuid references public.recipients(id) on delete set null
);

create index if not exists field_interventions_device_created_idx
  on public.field_interventions (device_id, created_at desc);

create index if not exists field_interventions_status_idx
  on public.field_interventions (status);

alter table public.field_interventions enable row level security;

-- SELECT : same company as the device + same company as the authed recipient
create policy "field_interventions_tenant_select" on public.field_interventions
  for select
  using (
    exists (
      select 1
      from public.devices d
      join public.recipients r on r.company_id = d.company_id
      where d.id = field_interventions.device_id
        and r.auth_user_id = auth.uid()
    )
  );

-- UPDATE : admin role + same company (used to mark as resolved)
create policy "field_interventions_admin_update" on public.field_interventions
  for update
  using (
    exists (
      select 1
      from public.devices d
      join public.recipients r on r.company_id = d.company_id
      where d.id = field_interventions.device_id
        and r.auth_user_id = auth.uid()
        and r.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.devices d
      join public.recipients r on r.company_id = d.company_id
      where d.id = field_interventions.device_id
        and r.auth_user_id = auth.uid()
        and r.role = 'admin'
    )
  );

-- INSERT : denied for anon/authenticated (only via service_role from Edge Function)
-- No insert policy → blocked under RLS;
