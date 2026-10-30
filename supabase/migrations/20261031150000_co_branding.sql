-- Co-branding : logo / site web / couleur de l'entreprise affichés dans le portail (à côté de Hexa-AI, jamais à sa place),
-- et page de connexion par entreprise https://my.hexa-ai.fr/<slug> (lecture publique limitée).
-- Le logo existe déjà (companies.logo_path, bucket public `branding`, policies branding_write/update/delete).

alter table public.companies
  add column if not exists website text,
  add column if not exists brand_color text,
  add column if not exists logo_dark_path text,
  add column if not exists slug text;

-- site web : http(s) seulement (le lien est affiché tel quel dans l'en-tête)
alter table public.companies drop constraint if exists companies_website_valid;
alter table public.companies add constraint companies_website_valid
  check (website is null or (website ~ '^https?://[^[:space:]<>"'']+$' and length(website) <= 255));

-- couleur principale du client : #rrggbb
alter table public.companies drop constraint if exists companies_brand_color_valid;
alter table public.companies add constraint companies_brand_color_valid
  check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');

-- slug : minuscules, chiffres, tirets ; 2 à 40 caractères ; JAMAIS un premier segment d'URL existant (QR codes
-- /intervention?d=…, liens des mails /auth/…, /login, /admin…). La même liste est dans app/src/router/reservedSlugs.ts.
alter table public.companies drop constraint if exists companies_slug_valid;
alter table public.companies add constraint companies_slug_valid
  check (slug is null or (
    slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'
    and slug not in (
      'login', 'auth', 'intervention', 'interventions', 'admin', 'devices', 'dashboards', 'dashboard', 'map',
      'alarms', 'projects', 'recipients', 'notifications', 'updates', 'staff', 'alarm-recipients', 'assets',
      'api', 'ingress', 'provision', 'forgot-password', 'reset-password', 'magic-link', 'callback', 'accept',
      'home', 'index', 'sw', 'manifest', 'favicon', 'public', 'static', 'logout', 'signup', 'register', 'www',
      'my', 'app', 'hexa', 'hexa-ai', 'myhexa', 'partage', 'share', 'support', 'docs', 'status', 'null', 'undefined'
    )
  ));

create unique index if not exists companies_slug_key on public.companies (slug) where slug is not null;

-- Lecture publique (anon) : UNIQUEMENT ce qui sert à habiller la page de connexion. Rien d'autre (ni id, ni contact, ni adresse).
create or replace function public.company_branding_by_slug(p_slug text)
returns table (name text, logo_path text, logo_dark_path text, website text, brand_color text)
language sql stable security definer set search_path = public as $$
  select c.name, c.logo_path, c.logo_dark_path, c.website, c.brand_color
  from companies c
  where c.slug is not null and c.slug = lower(btrim(p_slug))
  limit 1
$$;
revoke all on function public.company_branding_by_slug(text) from public;
grant execute on function public.company_branding_by_slug(text) to anon, authenticated;

-- Modification par l'admin de l'entreprise ou le staff (les admins n'ont pas le droit d'UPDATE direct sur companies).
create or replace function public.set_company_branding(p_company uuid, p_website text, p_brand_color text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_company(p_company) then
    raise exception 'réservé à l''administrateur' using errcode = '42501';
  end if;
  update companies
     set website = nullif(btrim(p_website), ''),
         brand_color = nullif(btrim(p_brand_color), ''),
         updated_at = now()
   where id = p_company;
end $$;
revoke all on function public.set_company_branding(uuid, text, text) from public, anon;
grant execute on function public.set_company_branding(uuid, text, text) to authenticated;

-- logo variante sombre (optionnel)
create or replace function public.set_company_logo_dark(p_company uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not can_manage_company(p_company) then
    raise exception 'réservé à l''administrateur' using errcode = '42501';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> p_company::text then
    raise exception 'chemin invalide' using errcode = '22023';
  end if;
  update companies set logo_dark_path = p_path, updated_at = now() where id = p_company;
end $$;
revoke all on function public.set_company_logo_dark(uuid, text) from public, anon;
grant execute on function public.set_company_logo_dark(uuid, text) to authenticated;

-- le slug (adresse de la page de connexion) est réservé au staff Hexa-AI
create or replace function public.set_company_slug(p_company uuid, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_hexa_staff() then
    raise exception 'réservé au staff Hexa-AI' using errcode = '42501';
  end if;
  update companies set slug = nullif(lower(btrim(p_slug)), ''), updated_at = now() where id = p_company;
end $$;
revoke all on function public.set_company_slug(uuid, text) from public, anon;
grant execute on function public.set_company_slug(uuid, text) to authenticated;
