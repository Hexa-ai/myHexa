// Gmail send via the REST API (NOT SMTP).
//
// Why: denomailer / SMTP libs hang or fail in Supabase Edge Runtime because
// of the Worker / TLS APIs they rely on. The Gmail HTTP API works perfectly
// with plain fetch().
//
// Auth: Service Account with Domain-wide Delegation. The service account
// signs a JWT, exchanges it for an OAuth access token, then we call
// users.messages.send impersonating GMAIL_IMPERSONATE_USER.
//
// Secrets required:
//   GOOGLE_SA_EMAIL          — service account email (client_email in JSON)
//   GOOGLE_SA_PRIVATE_KEY    — service account private key (private_key in JSON,
//                              `\n` escapes will be decoded automatically)
//   GMAIL_IMPERSONATE_USER   — user to send as (e.g. julien.talbourdet@hexa-ai.fr)
//   GMAIL_FROM_NAME (opt.)   — display name (defaults to "myHexa")

const GOOGLE_SA_EMAIL = Deno.env.get('GOOGLE_SA_EMAIL') ?? ''
const GOOGLE_SA_PRIVATE_KEY = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n')
const GMAIL_IMPERSONATE_USER = Deno.env.get('GMAIL_IMPERSONATE_USER') ?? ''
const FROM_NAME = Deno.env.get('GMAIL_FROM_NAME') ?? 'myHexa'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'

export interface MailInput {
  to: string
  subject: string
  html: string
  /** Optional override of the sender display name. */
  fromName?: string
  /** Optional reply-to header. */
  replyTo?: string
  /** Images inline référencées dans le HTML par src="cid:<cid>" (rapports). */
  inline?: { cid: string; contentType: string; data: Uint8Array }[]
  /** Pièces jointes (CSV des rapports). */
  attachments?: { filename: string; contentType: string; data: Uint8Array }[]
}

/** Configuration Gmail présente ? (absente sur le projet de test : aucun envoi possible) */
export function mailerConfigured(): boolean {
  return !!(GOOGLE_SA_EMAIL && GOOGLE_SA_PRIVATE_KEY && GMAIL_IMPERSONATE_USER)
}

function b64bytes(data: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return btoa(bin).replace(/(.{76})/g, '$1\r\n')
}
const encWord = (s: string) => `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`

interface CachedToken {
  token: string
  /** Epoch ms when this token must be considered expired. */
  expiresAt: number
}

let cached: CachedToken | null = null
let cryptoKey: CryptoKey | null = null

function base64urlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** PEM → ArrayBuffer (DER), strips header/footer + base64 decodes. */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(body)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

async function getCryptoKey(): Promise<CryptoKey> {
  if (cryptoKey) return cryptoKey
  if (!GOOGLE_SA_PRIVATE_KEY) throw new Error('Missing GOOGLE_SA_PRIVATE_KEY env var')
  const keyData = pemToArrayBuffer(GOOGLE_SA_PRIVATE_KEY)
  cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return cryptoKey
}

async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token

  if (!GOOGLE_SA_EMAIL) throw new Error('Missing GOOGLE_SA_EMAIL env var')
  if (!GMAIL_IMPERSONATE_USER) throw new Error('Missing GMAIL_IMPERSONATE_USER env var')

  const now = Math.floor(Date.now() / 1000)
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64urlEncode(JSON.stringify({
    iss: GOOGLE_SA_EMAIL,
    sub: GMAIL_IMPERSONATE_USER,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claims}`
  const key = await getCryptoKey()
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  )
  const jwt = `${unsigned}.${base64urlEncode(new Uint8Array(sig))}`

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Google token exchange ${res.status}: ${t}`)
  }
  const data = await res.json() as { access_token: string; expires_in: number }
  cached = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cached.token
}

/** Build an RFC822 message and base64url-encode it for Gmail API.
 *  Sans image ni pièce jointe : text/html simple (inchangé). Sinon multipart/mixed > multipart/related > html + images. */
function buildRawMessage(input: MailInput, fromHeader: string): string {
  const lines = [
    `From: ${fromHeader}`,
    `To: ${input.to}`,
    `Subject: ${encWord(input.subject)}`,
    'MIME-Version: 1.0',
  ]
  if (input.replyTo) lines.push(`Reply-To: ${input.replyTo}`)
  const htmlPart = btoa(unescape(encodeURIComponent(input.html))).replace(/(.{76})/g, '$1\n')
  if (!input.inline?.length && !input.attachments?.length) {
    lines.push('Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64')
    return base64urlEncode(lines.join('\r\n') + '\r\n\r\n' + htmlPart)
  }
  const bMix = 'mix_' + crypto.randomUUID()
  const bRel = 'rel_' + crypto.randomUUID()
  const out: string[] = [...lines, `Content-Type: multipart/mixed; boundary="${bMix}"`, '', `--${bMix}`]
  out.push(`Content-Type: multipart/related; boundary="${bRel}"`, '', `--${bRel}`)
  out.push('Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', htmlPart)
  for (const im of input.inline ?? []) {
    out.push(`--${bRel}`, `Content-Type: ${im.contentType}`, 'Content-Transfer-Encoding: base64')
    out.push(`Content-ID: <${im.cid}>`, `Content-Disposition: inline; filename="${im.cid}.png"`, '', b64bytes(im.data))
  }
  out.push(`--${bRel}--`)
  for (const at of input.attachments ?? []) {
    out.push(`--${bMix}`, `Content-Type: ${at.contentType}; name="${encWord(at.filename)}"`, 'Content-Transfer-Encoding: base64')
    out.push(`Content-Disposition: attachment; filename="${encWord(at.filename)}"`, '', b64bytes(at.data))
  }
  out.push(`--${bMix}--`, '')
  return base64urlEncode(out.join('\r\n'))
}

export async function sendMail(input: MailInput): Promise<void> {
  const accessToken = await getAccessToken()
  const fromName = input.fromName ?? FROM_NAME
  const fromHeader = `${fromName} <${GMAIL_IMPERSONATE_USER}>`
  const raw = buildRawMessage(input, fromHeader)

  const url = `https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(GMAIL_IMPERSONATE_USER)}/messages/send`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Gmail API send ${res.status}: ${t}`)
  }
}

/** No-op kept for API compatibility with the previous SMTP mailer. */
export async function closeMailer(): Promise<void> {
  // Gmail API is stateless (HTTPS per call). The access_token cache stays in
  // memory until next cold-start or expiry. Nothing to close.
}
