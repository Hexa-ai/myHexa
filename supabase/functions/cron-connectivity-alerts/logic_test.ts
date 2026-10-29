// deno test --no-lock supabase/functions/cron-connectivity-alerts/logic_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildEmail, computeTransitions, type CompanyCfg } from "./logic.ts";

const NOW = Date.parse("2026-10-29T18:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const companies = new Map<string, CompanyCfg>([
  ["A", { enabled: true, delayMin: 60 }],
  ["B", { enabled: false, delayMin: 60 }],
  ["C", { enabled: true, delayMin: 240 }],
]);
const dev = (id: string, company: string, paused: string | null = null) => ({
  id,
  company_id: company,
  name: id,
  paused_until: paused,
});

Deno.test("perte après le délai de l'entreprise, pas avant", () => {
  const t = computeTransitions(
    [dev("a1", "A"), dev("a2", "A"), dev("c1", "C")],
    new Map([
      ["a1", ago(61)],
      ["a2", ago(59)],
      ["c1", ago(120)],
    ]),
    new Map(),
    companies,
    NOW,
  );
  assertEquals(
    t.map((x) => [x.device_id, x.transition]),
    [["a1", "lost"]],
  );
});

Deno.test("entreprise désactivée : aucune alerte", () => {
  const t = computeTransitions(
    [dev("b1", "B")],
    new Map([["b1", ago(500)]]),
    new Map(),
    companies,
    NOW,
  );
  assertEquals(t.length, 0);
});

Deno.test("maintenance en cours : aucune alerte ; terminée : alerte", () => {
  const futur = new Date(NOW + 3600_000).toISOString();
  const passe = new Date(NOW - 60_000).toISOString();
  const t = computeTransitions(
    [dev("a1", "A", futur), dev("a2", "A", passe)],
    new Map([
      ["a1", ago(200)],
      ["a2", ago(200)],
    ]),
    new Map(),
    companies,
    NOW,
  );
  assertEquals(
    t.map((x) => x.device_id),
    ["a2"],
  );
});

Deno.test("déjà signalée : pas de doublon ; retour : reconnectée", () => {
  const t = computeTransitions(
    [dev("a1", "A"), dev("a2", "A")],
    new Map([
      ["a1", ago(300)],
      ["a2", ago(5)],
    ]),
    new Map([
      ["a1", { state: "lost" as const, at: ago(200) }],
      ["a2", { state: "lost" as const, at: ago(30) }],
    ]),
    companies,
    NOW,
  );
  assertEquals(
    t.map((x) => [x.device_id, x.transition]),
    [["a2", "recovered"]],
  );
});

Deno.test(
  "délai allongé : pas de fausse reconnexion sans nouvelles données",
  () => {
    const t = computeTransitions(
      [dev("c1", "C")],
      new Map([["c1", ago(90)]]),
      new Map([["c1", { state: "lost" as const, at: ago(20) }]]),
      companies,
      NOW,
    );
    assertEquals(t.length, 0);
  },
);

Deno.test("mail groupé : un sujet, toutes les box, échappement HTML", () => {
  const ts = computeTransitions(
    [dev("P<1>", "A"), dev("P2", "A")],
    new Map([
      ["P<1>", ago(90)],
      ["P2", ago(70)],
    ]),
    new Map(),
    companies,
    NOW,
  );
  const m = buildEmail(ts, { name: "Léa" }, null);
  assertEquals(m.subject, "2 box injoignables");
  assert(m.html.includes("P&lt;1&gt;") && m.html.includes("P2"));
  assert(!m.html.includes("Ouvrir le portail"));
  const one = buildEmail([ts[1]], { name: null }, "https://x/y");
  assertEquals(one.subject, "Box injoignable : P2");
  assert(one.html.includes("Ouvrir le portail"));
});
