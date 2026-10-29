// Émission du jeton Realtime court d'une box. Partagé par :
//   - l'Edge Function realtime-token (POST /functions/v1/realtime-token)
//   - device-ingress, route POST /<hostname>/realtime-token (et /ingress/<hostname>/realtime-token)
// La seconde est celle que le firmware appelle : elle passe par la même adresse de base que les webhooks
// (https://api.hexa-ai.fr/ingress/<hostname>/realtime-token), donc sans règle de relais supplémentaire.
//
// Le jeton de provisionnement (Bearer) est vérifié EXACTEMENT comme dans device-ingress : devices.token = jeton
// (fonction SQL realtime_box_lookup, même test que ingest_status), en plus box ni retournée ni mise au rebut.
//
// Signature : HS256 avec le secret JWT « legacy » du projet, fourni par le secret de fonction RT_JWT_SECRET
// (un secret ne peut pas commencer par SUPABASE_). Realtime vérifie ce même secret.
// Si le projet passe aux clés de signature asymétriques, il faudra signer avec la clé privée (ES256) : voir RAPPORT.md.
// Rôle DB du JWT : box_rt (voir la migration) — PostgREST le refuse, seul Realtime l'accepte.
//
// ATTENTION firmware : ici 401 = jeton refusé, mais ne JAMAIS effacer le jeton de provisionnement sur cette
// réponse (le firmware efface son jeton sur 401 pour /ingress : ce n'est pas la même route). Réessayer avec backoff.

// deno-lint-ignore no-explicit-any
type Admin = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: any }> };

const TTL_S = () => Number(Deno.env.get("RT_TOKEN_TTL_S") ?? "1800"); // 30 min

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signHS256(claims: Record<string, unknown>, secret: string): Promise<string> {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

// Frein minimal contre l'essai de jetons (par isolat, volontairement simple) : 30 échecs / minute / IP.
const fails = new Map<string, { n: number; t: number }>();
function throttled(ip: string): boolean {
  const f = fails.get(ip);
  return !!f && Date.now() - f.t < 60_000 && f.n >= 30;
}
function noteFail(ip: string) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.t >= 60_000) fails.set(ip, { n: 1, t: Date.now() });
  else f.n++;
}

export async function issueRealtimeToken(req: Request, admin: Admin): Promise<Response> {
  const secret = Deno.env.get("RT_JWT_SECRET") ?? "";
  if (!secret) {
    console.error("realtime-token: RT_JWT_SECRET absent");
    return json(500, { error: "server misconfigured" });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  if (throttled(ip)) return json(429, { error: "too many attempts" });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "").trim();
  const { data, error } = await admin.rpc("realtime_box_lookup", { p_token: token, p_ip: ip });
  if (error) {
    console.error("realtime-token: lookup", error.message);
    return json(500, { error: "unknown state" });
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.device_id) {
    noteFail(ip);
    console.warn("realtime-token: refusé (jeton inconnu ou box désactivée)", ip);
    return json(401, { error: "unauthorized" });
  }

  const ttl = TTL_S();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const now = Math.floor(Date.now() / 1000);
  const topic = `box:${row.device_id}`;
  const jwt = await signHS256({
    iss: "myhexa-realtime-token",
    aud: "authenticated",
    role: "box_rt",
    sub: row.device_id,
    device_id: row.device_id,
    company_id: row.company_id,
    topic,
    iat: now,
    exp: now + ttl,
  }, secret);
  console.log("realtime-token: émis", row.device_id);
  return json(200, {
    token: jwt,
    token_type: "Bearer",
    expires_at: now + ttl,
    expires_in: ttl,
    renew_after: Math.floor(ttl * 2 / 3), // la box renouvelle aux 2/3 de la durée
    device_id: row.device_id,
    topic,
    realtime_url: `${supabaseUrl.replace(/^http/, "ws")}/realtime/v1/websocket`,
    apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", // clé publique anon, exigée par la passerelle (pas un secret)
    // paramètres pilotés par le serveur (modifiables sans mise à jour du firmware)
    params: {
      heartbeat_s: 30,
      fast_interval_ms: 1000, // mode rapide (spectateur « fast »), limité à max_direct_s
      slow_interval_ms: 10000, // mode lent (affichage permanent)
      slow_deadband_pct: 0.5, // bande morte du mode lent
      max_msgs_per_s: 2,
      max_direct_s: 900,
    },
  });
}
