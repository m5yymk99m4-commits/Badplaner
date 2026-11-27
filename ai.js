// Badplaner VR – KI-Planung
// Übersetzt Kundenwünsche + Grundriss in fertige Planungsvarianten.
// Spricht die Claude-API von Anthropic an. Kundenname und Adresse werden NICHT gesendet.
'use strict';

// ---------- Katalog (muss zu public/planner.html passen) ----------
const CATALOG = {
  wc: { label: 'WC', vars: { wand: { name: 'Wand-WC spülrandlos', w: .37, d: .54, price: 389 }, stand: { name: 'Stand-WC mit Spülkasten', w: .37, d: .68, price: 249 }, dusch: { name: 'Dusch-WC', w: .4, d: .58, price: 1490 } } },
  wt: { label: 'Waschtisch', vars: { w60: { name: 'Waschtisch 60 cm mit Unterschrank', w: .6, d: .46, price: 490 }, w80: { name: 'Waschtisch 80 cm mit Unterschrank', w: .8, d: .48, price: 690 }, w120: { name: 'Doppelwaschtisch 120 cm', w: 1.2, d: .48, price: 1190 }, auf: { name: 'Aufsatzbecken auf Konsole 100 cm', w: 1, d: .5, price: 890 } },
    arms: { stand: { name: 'Standarmatur', price: 149 }, hoch: { name: 'Hohe Armatur', price: 219 }, wand: { name: 'Wandarmatur Unterputz', price: 329 } } },
  sp: { label: 'Spiegel', vars: { led: { name: 'LED-Spiegel', w: .8, d: .03, price: 249 }, schrank: { name: 'Spiegelschrank', w: .8, d: .16, price: 549 }, rund: { name: 'Rundspiegel Ø 60', w: .6, d: .03, price: 179 } }, size: { w: [.5, 1.6] } },
  du: { label: 'Dusche', vars: { walk: { name: 'Walk-in 120 × 90', w: 1.2, d: .9, price: 1290 }, eck: { name: 'Eckdusche 90 × 90 mit Tür', w: .9, d: .9, price: 890 }, nische: { name: 'Nischendusche 100 × 90 (zwischen zwei Wänden)', w: 1, d: .9, price: 990 } },
    arms: { regen: { name: 'Regenbrause-Set Aufputz', price: 449 }, up: { name: 'Unterputz-Thermostat + Kopfbrause', price: 790 }, hand: { name: 'Brausestange', price: 189 } } },
  wa: { label: 'Badewanne', vars: { r170: { name: 'Einbauwanne 170 × 75, gefliest', w: 1.7, d: .75, price: 690 }, r180: { name: 'Einbauwanne 180 × 80, gefliest', w: 1.8, d: .8, price: 790 }, frei: { name: 'Freistehende Wanne 170 × 80', w: 1.7, d: .95, price: 1690 } },
    arms: { wand: { name: 'Wannenarmatur Aufputz', price: 199 }, stand: { name: 'Standarmatur bodenstehend', price: 590 } } },
  hk: { label: 'Handtuchheizkörper', vars: { hk: { name: 'Handtuchheizkörper 50 × 120', w: .5, d: .1, price: 329 } } },
  vw: { label: 'Vorwand', vars: { v: { name: 'Vorwand mit Ablage, 1,10 m hoch, 20 cm tief', w: 1.2, d: .2, price: 0, perM: 140 } }, size: { w: [.4, 3] } },
  ni: { label: 'Wandnische', vars: { n: { name: 'Wandnische mit LED, 12 cm tief', w: .6, h: .4, y: 1.1, price: 290 } }, size: { w: [.3, 1.5], h: [.2, 1.2], y: [.2, 1.8] } },
};
const TILES_WALL = { weiss: ['Weiß glänzend 30 × 60', 29], beton: ['Betongrau 60 × 120', 49], salbei: ['Salbei Metro 7,5 × 15', 39], marmor: ['Marmoroptik 60 × 120', 69], navy: ['Nachtblau Zellige 10 × 10', 89] };
const TILES_FLOOR = { eiche: ['Holzoptik Eiche 20 × 120', 45], anthrazit: ['Anthrazit 60 × 60', 39], terrazzo: ['Terrazzo 60 × 60', 59], marmorb: ['Marmoroptik 60 × 60', 69] };
const GROUT = { auto: 'passend zur Fliese', hell: 'hell', grau: 'grau', dunkel: 'anthrazit' };
const FINISH = { chrom: ['Chrom', 0], edel: ['Edelstahl gebürstet', 40], schwarz: ['Schwarz matt', 60], gold: ['Gold gebürstet', 90] };
const FURN = { eiche: 'Eiche', weiss: 'Weiß Hochglanz', anth: 'Anthrazit', gruen: 'Salbeigrün' };
const PLACEABLE = Object.keys(CATALOG);
const FLOOR_TYPES = ['wc', 'wt', 'du', 'wa', 'hk', 'vw'];

// ---------- Geometrie ----------
function walls(pts) {
  const n = pts.length;
  return pts.map((A, i) => {
    const B = pts[(i + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], len = Math.hypot(dx, dz) || .001;
    return { A, B, len, d: [dx / len, dz / len] };
  });
}
function area(pts) { let s = 0; pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }); return s / 2; }
const r2 = v => Math.round(v * 100) / 100;
const de = v => r2(v).toFixed(2).replace('.', ',');
function cornerKind(W, i) { // Ecke am Ende von Wand i
  const a = W[i], b = W[(i + 1) % W.length], cross = a.d[0] * b.d[1] - a.d[1] * b.d[0], dot = a.d[0] * b.d[0] + a.d[1] * b.d[1];
  const right = Math.abs(dot) < .05;
  if (cross > 0) return right ? 'normale Innenecke (90°)' : 'Innenecke (schräg)';
  return right ? 'vorspringende Ecke (Schacht/Vorsprung, 90°)' : 'vorspringende Ecke (schräg)';
}
function dimsOf(it) {
  const v = CATALOG[it.type].vars[it.v];
  return { w: it.w ?? v.w, d: v.d || 0, h: it.h ?? v.h, y: it.y ?? v.y };
}

// ---------- Prüfung der KI-Ergebnisse ----------
function conflicts(plan) {
  const W = walls(plan.pts), out = [], n = W.length;
  const floor = plan.items.filter(it => FLOOR_TYPES.includes(it.type) || it.type === 'tu').map(it => {
    const D = dimsOf(it.type === 'tu' ? { ...it, type: 'ni', v: 'n' } : it);
    const w = it.type === 'tu' ? (it.w ?? .86) : D.w;
    return { it, a: it.t - w / 2, b: it.t + w / 2, d: it.type === 'tu' ? w : D.d, name: it.type === 'tu' ? 'Tür (Schwenkbereich)' : CATALOG[it.type].vars[it.v].name };
  });
  floor.forEach(f => {
    const L = W[f.it.wall].len;
    if (f.a < -.01 || f.b > L + .01) out.push(`${f.name} ragt über Wand W${f.it.wall + 1} hinaus (Wand ist ${de(L)} m lang).`);
  });
  for (let i = 0; i < floor.length; i++) for (let j = i + 1; j < floor.length; j++) {
    const p = floor[i], q = floor[j];
    if (p.it.wall === q.it.wall && p.a < q.b - .05 && q.a < p.b - .05) out.push(`${p.name} und ${q.name} überlappen sich auf Wand W${p.it.wall + 1}.`);
  }
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    if (!cornerKind(W, i).startsWith('normale')) continue;
    floor.filter(f => f.it.wall === i).forEach(p => floor.filter(f => f.it.wall === next).forEach(q => {
      const distP = W[i].len - p.b, distQ = q.a;
      if (distP < q.d - .02 && distQ < p.d - .02) out.push(`${p.name} (W${i + 1}) und ${q.name} (W${next + 1}) stoßen in der Ecke zusammen.`);
    }));
  }
  return [...new Set(out)];
}

// ---------- Plan aus KI-Antwort bauen ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function normalize(base, e) {
  const W = walls(base.pts), n = W.length;
  const m = e.material || {};
  const plan = {
    H: base.H || 2.5, pts: base.pts,
    wall: TILES_WALL[m.wandfliese] ? m.wandfliese : 'weiss',
    floor: TILES_FLOOR[m.bodenfliese] ? m.bodenfliese : 'eiche',
    grout: GROUT[m.fuge] ? m.fuge : 'auto',
    tileH: m.fliesenhoehe === 'halb' ? 'halb' : 'voll',
    finish: FINISH[m.armaturen] ? m.armaturen : 'chrom',
    furn: FURN[m.moebel] ? m.moebel : 'eiche',
    accent: Number.isInteger(m.akzentwand) && m.akzentwand >= 1 && m.akzentwand <= n ? m.akzentwand - 1 : null,
    accentTile: TILES_WALL[m.akzentfliese] ? m.akzentfliese : 'navy',
    mood: 'tag', deko: true, items: [],
  };
  let id = 1;
  (base.items || []).filter(it => it.type === 'tu' || it.type === 'fe').forEach(it => plan.items.push({ ...it, id: id++ }));
  (Array.isArray(e.objekte) ? e.objekte : []).slice(0, 20).forEach(o => {
    const cat = CATALOG[o.typ];
    if (!cat || !cat.vars[o.modell]) return;
    const wall = clamp(Math.round(Number(o.wand) || 1), 1, n) - 1;
    const it = { id: id++, type: o.typ, v: o.modell, wall, t: 0 };
    if (cat.arms) it.arm = cat.arms[o.armatur] ? o.armatur : Object.keys(cat.arms)[0];
    const v = cat.vars[o.modell];
    if (cat.size) {
      if (cat.size.w) it.w = r2(clamp(Number(o.breite) || v.w, ...cat.size.w));
      if (cat.size.h) it.h = r2(clamp(Number(o.hoehe) || v.h, ...cat.size.h));
      if (cat.size.y) it.y = r2(clamp(Number(o.unterkante) || v.y, ...cat.size.y));
    }
    const w = it.w ?? v.w, L = W[wall].len;
    it.t = r2(clamp(Number(o.abstand) || L / 2, Math.min(w / 2, L / 2), Math.max(L - w / 2, L / 2)));
    if (o.gespiegelt === true) it.flip = true;
    plan.items.push(it);
  });
  plan.nid = id;
  return plan;
}

// ---------- Prompt ----------
const SYSTEM = `Du bist ein erfahrener Badplaner in Deutschland. Du planst Bäder für die Sanierung beim Endkunden.
Du bekommst einen vermessenen Grundriss, feste Türen und Fenster, die Kundenwünsche und einen Produktkatalog.
Erstelle daraus unterschiedliche, wirklich baubare Entwürfe und speichere sie IMMER mit dem Werkzeug "entwuerfe_speichern" (alle Entwürfe in einem einzigen Aufruf). Schreib keinen Text außerhalb des Werkzeugs.

Platzierungsregeln (sehr wichtig):
- Jedes Objekt steht an genau einer Wand. "wand" ist die Wandnummer (W1 = 1). "abstand" ist der Abstand der OBJEKTMITTE vom Wandanfang in Metern.
- Ein Objekt belegt auf seiner Wand den Bereich abstand ± breite/2 und ragt "tiefe" Meter in den Raum.
- Objekte auf derselben Wand dürfen sich nicht überlappen. Lass zwischen Objekten mindestens 10 cm Luft, zwischen WC-Mitte und seitlicher Wand oder Nachbarobjekt mindestens 45 cm.
- In normalen Innenecken stoßen die Wände im 90°-Winkel aneinander: Ein Objekt am Wandende ragt in den Anfang der nächsten Wand hinein. Plane das ein, damit nichts zusammenstößt.
- Vor WC, Waschtisch, Dusche und Wanne müssen mindestens 75 cm Bewegungsfläche frei bleiben, bei barrierefrei 120 × 120 cm.
- Türen und Fenster sind fest und dürfen nicht verplant werden. Den Schwenkbereich der Tür (Türbreite tief) und die Wand unter einem Fenster mit niedriger Brüstung nicht zustellen. Die Tür schwenkt in den Raum.
- Der Spiegel (sp) hängt über dem Waschtisch: gleiche Wand, gleicher abstand, breite etwa wie der Waschtisch.
- Wand-WC und Dusch-WC brauchen eine Vorwand, die ist im WC bereits enthalten. Eine zusätzliche Vorwand (vw) nur als Ablage.
- Duschen am besten in eine Ecke: abstand = breite/2 (Wandanfang) oder Wandlänge − breite/2 (Wandende). Die Eckdusche (eck) hat ihre Seitenwand auf der rechten Seite (Richtung Wandende); steht sie am Wandende, setze gespiegelt = true. Die Nischendusche nur zwischen zwei Wänden, wo die Nische genau passt.
- Eine Nische (ni) gehört meist in die Duschwand, Unterkante ca. 1,00–1,20 m.
- Der Handtuchheizkörper kommt auf eine freie Wandfläche, gern neben die Dusche.
- Bleib im Budget (Materialpreise aus dem Katalog plus Fliesen nach Fläche). Wenn das Budget nicht reicht, nimm günstigere Produkte und sag es in der Beschreibung.

Gestaltung:
- Die Entwürfe sollen sich spürbar unterscheiden (Stil, Farben, Aufteilung), aber alle zu den Wünschen passen.
- Wähle Fliesen, Fugenfarbe, Armaturen-Oberfläche und Möbelfront so, dass sie zusammen stimmig wirken.
- Die Beschreibung ist für den Endkunden: 2–3 kurze, freundliche Sätze auf Deutsch, was den Entwurf ausmacht und warum er zu den Wünschen passt. Keine Fachbegriffe, keine Maße.`;

function describe(base, wishes, trends, webTrends) {
  const W = walls(base.pts), n = W.length, A = Math.abs(area(base.pts));
  const lines = [];
  const U = W.reduce((s, w) => s + w.len, 0);
  lines.push(`RAUM\nGrundfläche ${de(A)} m², Raumhöhe ${de(base.H || 2.5)} m, ${n} Wände, Wandfläche raumhoch gefliest ca. ${de(U * (base.H || 2.5))} m² (halbhoch ca. ${de(U * 1.2)} m²).`);
  W.forEach((w, i) => lines.push(`W${i + 1}: Länge ${de(w.len)} m (von Ecke ${i + 1} zu Ecke ${(i + 1) % n + 1}). Am Wandende: ${cornerKind(W, i)} zu W${(i + 1) % n + 1}.`));
  const fixed = (base.items || []).filter(it => it.type === 'tu' || it.type === 'fe');
  lines.push('\nFESTE ÖFFNUNGEN');
  if (!fixed.length) lines.push('Keine eingezeichnet. Nimm an, die Tür ist in der Mitte der längsten Wand, die keine Objekte braucht, und lass dort 90 cm frei.');
  fixed.forEach(it => {
    const w = it.w ?? (it.type === 'tu' ? .86 : .9);
    if (it.type === 'tu') lines.push(`Tür auf W${it.wall + 1}: von ${de(it.t - w / 2)} bis ${de(it.t + w / 2)} m, schwenkt ${de(w)} m in den Raum.`);
    else lines.push(`Fenster auf W${it.wall + 1}: von ${de(it.t - w / 2)} bis ${de(it.t + w / 2)} m, Brüstung ${de(it.y ?? 1.1)} m, Höhe ${de(it.h ?? 1)} m.`);
  });
  lines.push('\nKUNDENWÜNSCHE');
  const labels = { freitext: 'Wunsch des Kunden in eigenen Worten', stil: 'Stil', farben: 'Farben und Materialien', budget: 'Budget für Material (Euro)', nutzung: 'Dusche/Wanne', personen: 'Personen im Haushalt', barrierefrei: 'Barrierefrei/altersgerecht', waschtisch: 'Waschtisch', wc: 'WC', stauraum: 'Stauraum', sonstiges: 'Weitere Wünsche' };
  let any = false;
  Object.entries(labels).forEach(([k, l]) => { const v = wishes && wishes[k]; if (v !== undefined && v !== null && String(v).trim() !== '') { lines.push(`${l}: ${String(v).slice(0, 1500)}`); any = true; } });
  if (!any) lines.push('Keine besonderen Wünsche angegeben. Plane zeitgemäß und praktisch.');
  if (webTrends && webTrends.trim()) lines.push('\nAKTUELLE BADTRENDS (aus der Internet-Recherche, als Inspiration nutzen, soweit sie zu den Wünschen passen)\n' + webTrends.trim().slice(0, 6000));
  if (trends && trends.trim()) lines.push('\nHAUSREGELN DER FIRMA (immer beachten)\n' + trends.trim().slice(0, 6000));
  lines.push('\nKATALOG (Breite × Tiefe in m, Preis in Euro)');
  Object.entries(CATALOG).forEach(([typ, c]) => {
    lines.push(`${typ} = ${c.label}: ` + Object.entries(c.vars).map(([id, v]) => `${id} „${v.name}“ ${de(v.w)} × ${typ === 'ni' ? de(v.h) + ' hoch' : de(v.d)}${v.perM ? `, ${v.perM} €/m` : `, ${v.price} €`}`).join('; '));
    if (c.arms) lines.push(`   Armaturen für ${typ}: ` + Object.entries(c.arms).map(([id, a]) => `${id} „${a.name}“ ${a.price} €`).join('; '));
    if (c.size) lines.push(`   anpassbar: ` + Object.entries(c.size).map(([k, r]) => `${{ w: 'breite', h: 'hoehe', y: 'unterkante' }[k]} ${de(r[0])}–${de(r[1])} m`).join(', '));
  });
  lines.push('Wandfliesen (€/m²): ' + Object.entries(TILES_WALL).map(([id, t]) => `${id} „${t[0]}“ ${t[1]}`).join('; '));
  lines.push('Bodenfliesen (€/m²): ' + Object.entries(TILES_FLOOR).map(([id, t]) => `${id} „${t[0]}“ ${t[1]}`).join('; '));
  lines.push('Fugenfarbe: ' + Object.entries(GROUT).map(([id, t]) => `${id} (${t})`).join(', '));
  lines.push('Armaturen-Oberfläche (Aufpreis je Armatur): ' + Object.entries(FINISH).map(([id, t]) => `${id} „${t[0]}“ +${t[1]} €`).join('; '));
  lines.push('Möbelfront: ' + Object.entries(FURN).map(([id, t]) => `${id} „${t}“`).join('; '));
  lines.push('Fliesenhöhe: voll (raumhoch) oder halb (1,20 m, darüber Farbe). Akzentwand: optional eine Wandnummer mit anderer Wandfliese.');
  lines.push(`Kleber, Fugen, Abdichtung: 12 €/m². LED-Einbaustrahler: je 39 €, ca. ein Strahler pro 1,6 m².`);
  return lines.join('\n');
}

const TOOL = {
  name: 'entwuerfe_speichern',
  description: 'Speichert die fertigen Badentwürfe.',
  input_schema: {
    type: 'object', required: ['entwuerfe'],
    properties: {
      entwuerfe: { type: 'array', minItems: 1, maxItems: 5, items: {
        type: 'object', required: ['titel', 'beschreibung', 'material', 'objekte'],
        properties: {
          titel: { type: 'string', description: 'Kurzer Name, 2–4 Wörter, z. B. „Warm & natürlich“' },
          beschreibung: { type: 'string', description: '2–3 Sätze für den Endkunden' },
          material: { type: 'object', required: ['wandfliese', 'bodenfliese', 'fuge', 'fliesenhoehe', 'armaturen', 'moebel'], properties: {
            wandfliese: { type: 'string', enum: Object.keys(TILES_WALL) },
            bodenfliese: { type: 'string', enum: Object.keys(TILES_FLOOR) },
            fuge: { type: 'string', enum: Object.keys(GROUT) },
            fliesenhoehe: { type: 'string', enum: ['voll', 'halb'] },
            armaturen: { type: 'string', enum: Object.keys(FINISH) },
            moebel: { type: 'string', enum: Object.keys(FURN) },
            akzentwand: { type: ['integer', 'null'], description: 'Wandnummer oder null' },
            akzentfliese: { type: 'string', enum: Object.keys(TILES_WALL) },
          } },
          objekte: { type: 'array', items: { type: 'object', required: ['typ', 'modell', 'wand', 'abstand'], properties: {
            typ: { type: 'string', enum: PLACEABLE },
            modell: { type: 'string' },
            armatur: { type: 'string' },
            wand: { type: 'integer', minimum: 1 },
            abstand: { type: 'number', description: 'Objektmitte ab Wandanfang in m' },
            breite: { type: 'number' }, hoehe: { type: 'number' }, unterkante: { type: 'number' },
            gespiegelt: { type: 'boolean' },
          } } },
        } } },
    },
  },
};

class AiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const API_VERSION = '2026-10-21';
const PREFERRED = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];
const apiBase = () => (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const headers = cfg => ({ 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': API_VERSION });

// Verständliche Fehlermeldung, immer mit dem Originaltext von Anthropic
function explain(status, data) {
  const type = data?.error?.type || '', msg = data?.error?.message || '';
  const orig = msg ? ` (Anthropic: ${msg})` : ` (Fehlercode ${status})`;
  if (status === 401 || type === 'authentication_error') return new AiError(502, 'Der KI-Schlüssel ist ungültig. Bitte unter „KI“ einen neuen eintragen.' + orig);
  if (/credit|balance|billing|purchase/i.test(msg) || type === 'billing_error') return new AiError(402, 'Das KI-Guthaben reicht nicht. Bitte in der Anthropic Console unter Billing Guthaben aufladen.' + orig);
  if (/web search/i.test(msg)) return new AiError(502, 'Die Websuche ist in deinem Anthropic-Konto ausgeschaltet. Bitte in der Anthropic Console unter Settings → Capabilities einschalten.' + orig);
  if (status === 403 || type === 'permission_error') return new AiError(502, 'Dein Anthropic-Konto darf das gerade nicht nutzen.' + orig);
  if (status === 429 || status === 529 || type === 'rate_limit_error' || type === 'overloaded_error') return new AiError(503, 'Die KI ist gerade ausgelastet. Bitte in einer Minute noch einmal versuchen.' + orig);
  return new AiError(502, 'Die KI hat einen Fehler gemeldet.' + orig);
}
const modelProblem = (status, data) => status === 404 || data?.error?.type === 'not_found_error' || (status === 400 && /model/i.test(data?.error?.message || '') && !/credit|balance|billing/i.test(data?.error?.message || ''));

async function listModels(cfg) {
  try {
    const r = await fetch(apiBase() + '/v1/models?limit=100', { headers: headers(cfg), signal: AbortSignal.timeout(20000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return [];
    return (d.data || []).filter(m => !m.lifecycle || m.lifecycle === 'active').map(m => m.id);
  } catch { return []; }
}
function pickModel(ids, avoid) {
  const ok = ids.filter(id => id !== avoid);
  return PREFERRED.find(p => ok.includes(p)) || ok.find(id => /sonnet/.test(id)) || ok.find(id => /opus/.test(id)) || ok[0] || null;
}

// Zentraler Aufruf: bei Modell-Problemen automatisch auf ein verfügbares Modell wechseln
async function request(cfg, body, timeoutMs, timeoutMsg) {
  let model = cfg.model;
  for (let attempt = 0; attempt < 2; attempt++) {
    let r;
    try { r = await fetch(apiBase() + '/v1/messages', { method: 'POST', headers: headers(cfg), body: JSON.stringify({ ...body, model }), signal: AbortSignal.timeout(timeoutMs) }); }
    catch { throw new AiError(504, timeoutMsg || 'Die KI hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen.'); }
    const data = await r.json().catch(() => ({}));
    if (r.ok) { if (model !== cfg.model) { cfg.model = model; if (cfg.onModel) cfg.onModel(model); } return data; }
    if (attempt === 0 && modelProblem(r.status, data)) {
      const next = pickModel(await listModels(cfg), model);
      if (next) { console.warn(`KI-Modell ${model} nicht nutzbar, wechsle zu ${next}: ${data?.error?.message || r.status}`); model = next; continue; }
    }
    throw explain(r.status, data);
  }
}

async function callClaude(cfg, messages, timeoutMs = 240000) {
  // Kein erzwungenes Werkzeug (nicht jedes Modell unterstützt das): KI bekommt es angeboten und soll es nutzen.
  const msgs = [...messages];
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await request(cfg, { max_tokens: 32000, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'auto' }, messages: msgs }, timeoutMs);
    const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === TOOL.name);
    if (use && Array.isArray(use.input?.entwuerfe) && use.input.entwuerfe.length) return { use, raw: data };
    if (data.stop_reason === 'max_tokens') throw new AiError(502, 'Die Antwort der KI war zu lang. Bitte weniger Ideen auf einmal erstellen.');
    msgs.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
    msgs.push({ role: 'user', content: 'Bitte speichere die Entwürfe jetzt mit dem Werkzeug „entwuerfe_speichern“. Keine weiteren Erklärungen.' });
  }
  throw new AiError(502, 'Die KI hat keine gültigen Entwürfe geliefert. Bitte noch einmal versuchen.');
}

async function design(cfg, base, wishes, count = 3) {
  if (!cfg.key) throw new AiError(400, 'Es ist noch kein KI-Schlüssel hinterlegt. Ein Admin kann ihn unter „KI“ eintragen.');
  if (!base || !Array.isArray(base.pts) || base.pts.length < 3) throw new AiError(400, 'Bitte zuerst den Grundriss zeichnen und bemaßen.');
  const prompt = describe(base, wishes, cfg.trends, cfg.webTrends) + `\n\nAUFGABE\nErstelle ${count} unterschiedliche Entwürfe für dieses Bad. Mindestens einer davon soll einen aktuellen Trend aufgreifen, einer soll besonders preisbewusst sein.`;
  const messages = [{ role: 'user', content: prompt }];
  let { use, raw } = await callClaude(cfg, messages);
  let plans = use.input.entwuerfe.map(e => ({ e, plan: normalize(base, e) }));
  const problems = plans.map((p, i) => ({ i, list: conflicts(p.plan) })).filter(p => p.list.length);
  if (problems.length) { // eine Korrekturrunde
    const text = 'Beim Prüfen sind diese Probleme aufgefallen:\n' + problems.map(p => `Entwurf ${p.i + 1} „${plans[p.i].e.titel}“:\n- ` + p.list.join('\n- ')).join('\n') +
      `\n\nBitte korrigiere die Platzierung und speichere ALLE ${plans.length} Entwürfe erneut (Stil und Materialien beibehalten).`;
    try {
      const fix = await callClaude(cfg, [...messages, { role: 'assistant', content: raw.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content: text }] }], 200000);
      const fixed = fix.use.input.entwuerfe.map(e => ({ e, plan: normalize(base, e) }));
      if (fixed.length) plans = fixed;
    } catch (e) { /* erste Version behalten */ }
  }
  return plans.map(({ e, plan }) => ({ name: String(e.titel || 'KI-Entwurf').slice(0, 80), note: String(e.beschreibung || '').slice(0, 1200), plan, hinweise: conflicts(plan) }));
}

async function test(cfg) {
  if (!cfg.key) throw new AiError(400, 'Kein Schlüssel eingetragen.');
  const data = await request(cfg, { max_tokens: 20, messages: [{ role: 'user', content: 'Antworte nur mit: OK' }] }, 30000, 'Keine Verbindung zur KI.');
  return { ok: true, model: cfg.model, answer_model: data.model || cfg.model, models: await listModels(cfg) };
}

// ---------- Trend-Recherche im Internet ----------
const TREND_PROMPT = () => `Recherchiere im Internet die aktuellen Trends für Badgestaltung und Badsanierung in Deutschland (heute ist ${new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}).
Nutze möglichst aktuelle Quellen: Fachmessen wie ISH, Hersteller (z. B. Villeroy & Boch, Duravit, Hansgrohe, Grohe, Geberit, Kaldewei), Fliesenhersteller, Fachpresse und Wohnmagazine.

Schreibe danach eine kompakte Zusammenfassung auf Deutsch als Stichpunkte, gegliedert in:
- Farben und Oberflächen (Fliesen, Wände, Fugen)
- Armaturen und Metall-Oberflächen
- Dusche, Wanne, WC, Waschtisch
- Licht, Stauraum, Nischen
- Altersgerecht und barrierefrei
- Was gerade aus der Mode kommt

Höchstens 25 Stichpunkte, jeder kurz und konkret, so dass ein Badplaner sie direkt umsetzen kann. Keine Einleitung, kein Fazit.`;
async function refreshTrends(cfg) {
  if (!cfg.key) throw new AiError(400, 'Es ist noch kein KI-Schlüssel hinterlegt.');
  const messages = [{ role: 'user', content: TREND_PROMPT() }];
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'DE', timezone: 'Europe/Berlin' } }];
  let content = [];
  for (let round = 0; round < 5; round++) {
    const data = await request(cfg, { max_tokens: 6000, tools, messages }, 240000, 'Die Trend-Recherche hat zu lange gedauert. Bitte später noch einmal.');
    content = content.concat(data.content || []);
    if (data.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: data.content });
  }
  const texts = content.filter(c => c.type === 'text');
  const text = texts.map(c => c.text).join('').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 80) throw new AiError(502, 'Die Recherche hat kein brauchbares Ergebnis geliefert. Bitte noch einmal versuchen.');
  const seen = new Map();
  texts.forEach(c => (c.citations || []).forEach(x => { if (x.url && !seen.has(x.url)) seen.set(x.url, { url: x.url, title: x.title || x.url }); }));
  if (!seen.size) content.filter(c => c.type === 'web_search_tool_result' && Array.isArray(c.content)).forEach(c => c.content.forEach(x => { if (x.url && !seen.has(x.url)) seen.set(x.url, { url: x.url, title: x.title || x.url }); }));
  return { text: text.slice(0, 6000), sources: [...seen.values()].slice(0, 15) };
}

module.exports = { design, test, refreshTrends, listModels, conflicts, normalize, describe, AiError, CATALOG };
