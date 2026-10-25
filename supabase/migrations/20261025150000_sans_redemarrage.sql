-- Pas de redémarrage ponctuel des box depuis le portail pour l'instant (décision de Julien, 25/10/2026) :
-- seuls le dépôt, les destinataires, l'escalade et la mise à jour sont pilotables. La fonction reste en base
-- (protocole box inchangé) mais n'est plus appelable par un compte du portail. Pour la rouvrir : grant execute ... to authenticated.
revoke execute on function public.queue_reboot(uuid, integer) from authenticated, anon, public;
