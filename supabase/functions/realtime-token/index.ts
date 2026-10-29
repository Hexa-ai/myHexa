// Edge Function: realtime-token
// Échange le jeton de provisionnement d'une box (Bearer, comme device-ingress) contre un JWT court pour Supabase
// Realtime, limité au canal privé de la box (topic « box:<devices.id> »). Logique dans _shared/realtimeToken.ts
// (la même route existe aussi dans device-ingress : POST /ingress/<hostname>/realtime-token).
//
//   POST /functions/v1/realtime-token   Authorization: Bearer <jeton box>
//     200 { token, expires_at, expires_in, renew_after, device_id, topic, realtime_url, apikey, params }
//     401 jeton inconnu / box retournée ou mise au rebut — 405 — 429 — 500
//
// À déployer avec verify_jwt = false : le Bearer est le jeton de la box, pas un JWT Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { issueRealtimeToken } from "../_shared/realtimeToken.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve((req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }
  return issueRealtimeToken(req, admin);
});
