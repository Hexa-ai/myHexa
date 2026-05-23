-- Auto-cleanup des auth.users orphelins après suppression d'un recipient.
--
-- Contexte : la edge function delete-recipient appelle auth.admin.deleteUser
-- mais peut échouer silencieusement (un console.error sans rollback). Et
-- toute suppression directe via SQL n'invoque jamais cette logique. Résultat :
-- des auth.users restent en base sans aucun recipient associé, ce qui bloque
-- les re-invites futures (email déjà existant) et pollue la table auth.users.
--
-- Ce trigger s'exécute AFTER DELETE sur public.recipients. Si le auth_user_id
-- du recipient supprimé n'a plus aucune référence dans public.recipients,
-- on supprime aussi la ligne auth.users correspondante.

CREATE OR REPLACE FUNCTION public.cleanup_orphan_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.auth_user_id IS NULL THEN RETURN OLD; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.recipients WHERE auth_user_id = OLD.auth_user_id) THEN
    DELETE FROM auth.users WHERE id = OLD.auth_user_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS recipients_cleanup_auth_user ON public.recipients;
CREATE TRIGGER recipients_cleanup_auth_user
AFTER DELETE ON public.recipients
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_orphan_auth_user();

COMMENT ON FUNCTION public.cleanup_orphan_auth_user() IS
  'Supprime l''entrée auth.users quand le dernier recipient qui la référençait est supprimé. Évite les comptes orphelins qui bloquent les re-invites.';

-- One-shot : nettoie les orphelins déjà présents.
-- On exclut explicitement les service users de Supabase (s'ils existent) en
-- ne touchant qu'aux IDs qui n'apparaissent dans aucun recipient.
DELETE FROM auth.users
WHERE id NOT IN (
  SELECT DISTINCT auth_user_id FROM public.recipients WHERE auth_user_id IS NOT NULL
)
AND email IS NOT NULL;
