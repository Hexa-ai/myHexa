-- Mode DIRECT, front : réglage « Affichage permanent » (écran mural) d'un tableau de bord précis.
--
-- Un tableau de bord dont live_display = true demande aux box une mise à jour LENTE (~10 s, valeurs modifiées seulement),
-- sans limite de durée et sans bandeau « Continuer », tant que le tableau est ouvert (cf. synoptique/CONCEPTION.md §5 bis).
--
-- Droits : AUCUNE nouvelle policy. La colonne suit celles de public.dashboards :
--   * lecture  : dashboards_select (can_view_dashboard) -> l'écran mural, même compte « lecteur », voit le réglage ;
--   * écriture : dashboards_write  (can_manage_company) -> administrateur de l'entreprise du tableau, ou staff Hexa-AI admin.
-- Un lecteur (viewer) ou l'admin d'une autre entreprise ne peut donc pas l'activer (vérifié par test d'API).
alter table public.dashboards
  add column if not exists live_display boolean not null default false;

comment on column public.dashboards.live_display is
  'Affichage permanent (écran mural) : direct lent (~10 s) sans limite de durée tant que le tableau est ouvert. Réglable par un admin de l''entreprise uniquement (policy dashboards_write).';
