-- Mode direct : droits du rôle box_rt alignés sur ce qui fonctionne sur le projet TEST (30/10).
-- 1) Le réglage Realtime « private_only » peut (re)créer realtime.messages : le grant de la migration
--    20261031090000 est alors perdu (constaté en prod). On le rejoue.
-- 2) Realtime prend le rôle du JWT via le rôle « authenticator » : box_rt doit en être membre, sinon le
--    jeton de la box est refusé (Unauthorized). PostgREST accepte alors ce jeton, mais box_rt n'a AUCUN
--    droit sur le schéma public (test de sécurité T20 : 403 sur l'API de données).
grant usage on schema realtime to box_rt;
grant select, insert on realtime.messages to box_rt;
grant box_rt to authenticator;
