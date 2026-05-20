// Gmail SMTP mailer (Workspace App Password) shared by cron edge functions.
// Reads GMAIL_USER and GMAIL_APP_PASSWORD from edge function secrets.
//
// Uses denomailer — a Deno-native SMTP client that doesn't require Node
// shims and supports STARTTLS on port 587 (Gmail).

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? ''
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD') ?? ''
const FROM_NAME = Deno.env.get('GMAIL_FROM_NAME') ?? 'myHexa'

export interface MailInput {
  to: string
  subject: string
  html: string
  /** Optional override of the sender name (e.g. "Julien Talbourdet"). */
  fromName?: string
  /** Optional override of the sender email. Defaults to GMAIL_USER. */
  fromEmail?: string
  /** Optional reply-to header. */
  replyTo?: string
}

let client: SMTPClient | null = null

function getClient(): SMTPClient {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars')
  }
  if (client) return client
  client = new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 587,
      tls: false, // STARTTLS upgrades from plain
      auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
    },
  })
  return client
}

export async function sendMail(input: MailInput): Promise<void> {
  const c = getClient()
  const fromEmail = input.fromEmail ?? GMAIL_USER
  const fromName = input.fromName ?? FROM_NAME
  await c.send({
    from: `${fromName} <${fromEmail}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
    replyTo: input.replyTo,
  })
}

/** Close the underlying SMTP connection. Call once at the end of a batch. */
export async function closeMailer(): Promise<void> {
  if (client) {
    try {
      await client.close()
    } catch {
      // ignore
    }
    client = null
  }
}
