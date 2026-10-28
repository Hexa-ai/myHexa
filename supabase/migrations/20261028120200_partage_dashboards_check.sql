-- MYH-010 : un tableau peut porter sur une box partagée à un membre de l'organisation du tableau.
-- La visibilité par l'auteur est vérifiée par la règle dashboards_write (dashboard_target_ok).
create or replace function public.dashboards_check()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scope = 'device' and not exists (
       select 1 from devices where id = new.device_id
          and (company_id = new.company_id or device_shared_with_company(id, new.company_id))) then
    raise exception 'la box n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  if new.scope = 'project' and not exists (select 1 from projects where id = new.project_id and company_id = new.company_id) then
    raise exception 'le projet n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  if new.scope = 'custom' and exists (
       select 1 from unnest(new.device_ids) u(id) left join devices d on d.id = u.id
        where d.id is null or (d.company_id <> new.company_id and not device_shared_with_company(d.id, new.company_id))) then
    raise exception 'une box n''appartient pas à l''entreprise' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
