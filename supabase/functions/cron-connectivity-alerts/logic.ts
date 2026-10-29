// Logique pure des alertes de liaison (sans accès réseau) : testée par logic_test.ts.

export interface Transition {
  device_id: string;
  hostname: string;
  company_id: string;
  last_seen_at: string;
  transition: "lost" | "recovered";
  offline_minutes: number;
}
export interface CompanyCfg {
  enabled: boolean;
  delayMin: number;
}
export interface DeviceRow {
  id: string;
  company_id: string;
  name: string | null;
  paused_until: string | null;
}

export function escapeHtml(s: string): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}j ${rh}h` : `${d}j`;
}

/** Transitions à notifier : entreprise active, box hors maintenance, délai de l'entreprise. */
export function computeTransitions(
  devices: DeviceRow[],
  lastSeen: Map<string, string>,
  notified: Map<string, { state: "lost" | "recovered"; at: string | null }>,
  companies: Map<string, CompanyCfg>,
  now: number,
): Transition[] {
  const out: Transition[] = [];
  for (const d of devices) {
    const cfg = companies.get(d.company_id);
    if (!cfg?.enabled) continue;
    if (d.paused_until && new Date(d.paused_until).getTime() > now) continue;
    const seen = lastSeen.get(d.id);
    if (!seen) continue;
    const seenMs = new Date(seen).getTime();
    const isLost = now - seenMs > cfg.delayMin * 60_000;
    const prev = notified.get(d.id);
    const last = prev?.state ?? null;
    // « Reconnectée » seulement si la box a réellement envoyé des données après l'alerte
    // (un changement de délai ne doit pas faire croire à une reconnexion).
    const newDataSinceAlert = !prev?.at || seenMs > new Date(prev.at).getTime();
    let next: "lost" | "recovered" | null = null;
    if (isLost && last !== "lost") next = "lost";
    else if (!isLost && last === "lost" && newDataSinceAlert)
      next = "recovered";
    if (next)
      out.push({
        device_id: d.id,
        hostname: d.name ?? d.id,
        company_id: d.company_id,
        last_seen_at: seen,
        transition: next,
        offline_minutes: Math.floor((now - seenMs) / 60000),
      });
  }
  return out;
}

/** Un mail par personne, qui regroupe toutes ses box concernées. */
export function buildEmail(
  ts: Transition[],
  recipient: { name: string | null },
  link: string | null,
): { subject: string; html: string } {
  const lost = ts.filter((t) => t.transition === "lost");
  const back = ts.filter((t) => t.transition === "recovered");
  let subject: string;
  if (ts.length === 1) {
    const t = ts[0];
    subject = `${t.transition === "lost" ? "Box injoignable" : "Box reconnectée"} : ${t.hostname}`;
  } else {
    const bits: string[] = [];
    if (lost.length)
      bits.push(`${lost.length} box injoignable${lost.length > 1 ? "s" : ""}`);
    if (back.length)
      bits.push(`${back.length} box reconnectée${back.length > 1 ? "s" : ""}`);
    subject = bits.join(", ");
  }
  const row = (t: Transition) =>
    t.transition === "lost"
      ? `<li style="margin:0 0 8px 0;"><strong>${escapeHtml(t.hostname)}</strong> : aucune donnée depuis le ${escapeHtml(formatDateTime(t.last_seen_at))} (${escapeHtml(formatDuration(t.offline_minutes))}).</li>`
      : `<li style="margin:0 0 8px 0;"><strong>${escapeHtml(t.hostname)}</strong> : données reçues à nouveau après environ ${escapeHtml(formatDuration(t.offline_minutes))} d'interruption.</li>`;
  const block = (
    title: string,
    color: string,
    bg: string,
    list: Transition[],
  ) =>
    list.length
      ? `<div style="background:${bg};border:1px solid ${color}33;padding:12px 16px;border-radius:8px;margin:0 0 16px 0;font-size:14px;"><p style="margin:0 0 8px 0;font-weight:600;color:${color};">${title}</p><ul style="margin:0;padding-left:18px;">${list.map(row).join("")}</ul></div>`
      : "";
  const cta = link
    ? `<p style="margin:0 0 20px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#00d4aa;color:#0a0f14;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">Ouvrir le portail</a></p>`
    : "";
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;color:#111;background:#fafafa;margin:0;padding:20px 24px;"><div style="max-width:600px;margin:0 auto;"><p style="margin:0 0 16px 0;color:#374151;font-size:14px;">Bonjour ${escapeHtml(recipient.name ?? "")},</p>${block("Connexion perdue", "#991b1b", "#fef2f2", lost)}${block("Connexion rétablie", "#065f46", "#ecfdf5", back)}${cta}<p style="margin:16px 0 0 0;color:#9ca3af;font-size:11px;">Vous recevez ce message car un administrateur de votre entreprise vous a choisi pour ces box dans myHexa (page Notifications).</p></div></body></html>`;
  return { subject, html };
}
