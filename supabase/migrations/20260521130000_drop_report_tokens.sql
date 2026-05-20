-- Étape 9/10 : la table report_tokens n'a plus de consommateur.
-- Les magic links Supabase Auth remplacent les tokens custom (étape 7).
DROP TABLE IF EXISTS public.report_tokens;
