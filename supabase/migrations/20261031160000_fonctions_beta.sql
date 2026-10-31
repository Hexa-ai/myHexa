-- Fonctionnalités en avant-première (bêta) par entreprise : seul le staff Hexa-AI (admin) les active.
-- Un client, même administrateur de son entreprise, ne peut pas s'activer une bêta.
alter table public.companies
  add column if not exists beta_features text[] not null default '{}';

comment on column public.companies.beta_features is
  'Fonctions en avant-première activées pour l''entreprise (ex. synoptique) ; modifiable par le staff admin seulement';

create or replace function public._guard_beta_features() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.beta_features is distinct from old.beta_features
     and auth.uid() is not null            -- service_role / SQL direct : autorisé
     and not public.is_hexa_staff_admin() then
    raise exception 'FORBIDDEN: beta_features réservé au staff' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public._guard_beta_features() from public, anon, authenticated;

drop trigger if exists companies_guard_beta on public.companies;
create trigger companies_guard_beta before update of beta_features on public.companies
  for each row execute function public._guard_beta_features();

-- entreprise interne Hexa-AI (même id en prod et sur le test)
update public.companies set beta_features = '{synoptique}'
  where id = '08a472a4-04de-498e-8f88-3aab12925134';
-- société de démonstration (test seulement : ligne absente en prod)
update public.companies set beta_features = '{synoptique}'
  where id = '00000000-0000-4000-8000-0000000de300';
