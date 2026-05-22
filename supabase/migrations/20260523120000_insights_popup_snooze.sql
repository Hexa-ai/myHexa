-- Ajoute une colonne snooze sur recipient_device_views.
-- Quand l'utilisateur clique "Plus tard" sur le popup insights, on stocke
-- une date future jusqu'à laquelle le popup ne se rouvrira pas automatiquement.
-- Override : un insight de sévérité 5 (Critique) créé après le moment du snooze
-- réouvre quand même le popup.

ALTER TABLE public.recipient_device_views
  ADD COLUMN IF NOT EXISTS popup_snoozed_until timestamptz;
