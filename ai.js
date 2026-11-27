// Badplaner VR – KI-Planung
// Übersetzt Kundenwünsche + Grundriss in fertige Planungsvarianten.
// Spricht die Claude-API von Anthropic an. Kundenname und Adresse werden NICHT gesendet.
'use strict';

// ---------- Katalog (muss zu public/planner.html passen) ----------
const CATALOG = {
  wc: { label: 'WC', vars: { wand: { name: 'Wand-WC spülrandlos', w: .37, d: .54, price: 389 }, stand: { name: 'Stand-WC mit Spülkasten', w: .37, d: .68, price: 249 }, dusch: { name: 'Dusch-WC', w: .4, d: .58, price: 1490 }, bidet: { name: 'Wand-Bidet', w: .37, d: .54, price: 349 } } },
  wt: { label: 'Waschtisch', vars: { h45: { name: 'Handwaschbecken 45 cm (Gäste-WC)', w: .45, d: .32, price: 190 }, w60: { name: 'Waschtisch 60 cm mit Unterschrank', w: .6, d: .46, price: 490 }, w80: { name: 'Waschtisch 80 cm mit Unterschrank', w: .8, d: .48, price: 690 }, w100: { name: 'Waschtisch 100 cm mit Unterschrank', w: 1, d: .48, price: 890 }, w120: { name: 'Doppelwaschtisch 120 cm', w: 1.2, d: .48, price: 1190 }, w140: { name: 'Doppelwaschtisch 140 cm', w: 1.4, d: .48, price: 1390 }, auf: { name: 'Aufsatzbecken auf Platte 100 cm', w: 1, d: .5, price: 890 }, auf2: { name: '2 Aufsatzbecken auf Platte 140 cm', w: 1.4, d: .5, price: 1490 } },
    arms: { stand: { name: 'Standarmatur', price: 149 }, hoch: { name: 'Hohe Armatur', price: 219 }, wand: { name: 'Wandarmatur Unterputz', price: 329 } },
    opts: { unterschrank: { key: 'sch', list: { schub: 'Schubladen', tuer: 'Türen', offen: 'offen (Ablage), -120 €' } } } },
  sp: { label: 'Spiegel', vars: { led: { name: 'LED-Spiegel', w: .8, d: .03, price: 249 }, schrank: { name: 'Spiegelschrank', w: .8, d: .16, price: 549 }, up: { name: 'Spiegelschrank Unterputz', w: .8, d: .03, price: 890 }, rund: { name: 'Rundspiegel Ø 60', w: .6, d: .03, price: 179 }, oval: { name: 'Ovaler Spiegel', w: .55, d: .03, price: 159 }, pur: { name: 'Spiegel ohne Licht', w: .8, d: .02, price: 89 } }, size: { w: [.5, 1.6] } },
  mo: { label: 'Möbel', vars: { hoch: { name: 'Hochschrank 40 cm', w: .4, d: .35, price: 590 }, seite: { name: 'Seitenschrank 40 cm', w: .4, d: .35, price: 390 }, regal: { name: 'Wandregal 60 cm (hängt über 1,25 m)', w: .6, d: .2, price: 149 }, wm: { name: 'Platz für Waschmaschine', w: .62, d: .62, price: 0 } } },
  du: { label: 'Dusche', vars: { walk: { name: 'Walk-in 120 × 90', w: 1.2, d: .9, price: 1290 }, walk140: { name: 'Walk-in 140 × 90', w: 1.4, d: .9, price: 1490 }, eck: { name: 'Eckdusche 90 × 90 mit Tür', w: .9, d: .9, price: 890 }, nische: { name: 'Nischendusche 100 × 90 (zwischen zwei Wänden)', w: 1, d: .9, price: 990 } },
    arms: { regen: { name: 'Regenbrause-Set Aufputz', price: 449 }, up: { name: 'Unterputz-Thermostat + Kopfbrause', price: 790 }, hand: { name: 'Brausestange', price: 189 } },
    opts: { boden: { key: 'boden', list: { eben: 'bodengleich gefliest (modern, Standard)', wanne: 'flache Duschwanne -150 €' } }, ablauf: { key: 'ablauf', list: { rinne: 'Duschrinne Edelstahl', rinnef: 'befliesbare Duschrinne in Fliesenfarbe +80 €', rinnes: 'Duschrinne schwarz +60 €', wand: 'Wandablauf, unsichtbar +190 €', punkt: 'Punktablauf -40 €' } }, trennung: { key: 'glas', list: { klar: 'Klarglas rahmenlos', schwarz: 'Glas mit schwarzem Rahmen +190 €', milch: 'Milchglas +120 €', mauerhalb: 'gemauert halbhoch + Glas darüber +350 €', mauer: 'gemauerte Wand raumhoch +450 €' } } } },
  wa: { label: 'Badewanne', vars: { r170: { name: 'Einbauwanne 170 × 75, gefliest', w: 1.7, d: .75, price: 690 }, r180: { name: 'Einbauwanne 180 × 80, gefliest', w: 1.8, d: .8, price: 790 }, frei: { name: 'Freistehende Wanne 170 × 80', w: 1.7, d: .95, price: 1690 } },
    arms: { wand: { name: 'Wannenarmatur Aufputz', price: 199 }, stand: { name: 'Standarmatur bodenstehend', price: 590 } } },
  ac: { label: 'Accessoire (an der Wand, stört keine Bodenfläche)', vars: { papier: { name: 'Toilettenpapierhalter', w: .16, d: .1, y: .75, price: 39 }, ersatz: { name: 'Ersatzrollenhalter', w: .1, d: .1, y: .45, price: 29 }, buerste: { name: 'WC-Bürstengarnitur', w: .1, d: .1, y: .3, price: 49 }, haken: { name: 'Handtuchhaken', w: .06, d: .05, y: 1.7, price: 19 }, stange: { name: 'Handtuchstange 60 cm', w: .6, d: .08, y: 1.1, price: 49 }, ring: { name: 'Handtuchring', w: .2, d: .07, y: 1.1, price: 35 }, seife: { name: 'Seifenspender', w: .08, d: .1, y: 1.05, price: 39 }, ablage: { name: 'Glasablage 50 cm', w: .5, d: .12, y: 1.15, price: 45 }, duschkorb: { name: 'Duschablage', w: .3, d: .12, y: 1.2, price: 59 }, griff: { name: 'Haltegriff 60 cm', w: .6, d: .08, y: .85, price: 69 }, sitz: { name: 'Duschklappsitz', w: .45, d: .4, y: .48, price: 189 } }, size: { y: [.2, 2] } },
  hk: { label: 'Heizkörper', vars: { hk: { name: 'Handtuchheizkörper 50 × 120', w: .5, d: .1, price: 329 }, hk60: { name: 'Handtuchheizkörper 60 × 170', w: .6, d: .1, price: 449 }, paneel: { name: 'Design-Heizkörper flach 50 × 180', w: .5, d: .08, price: 590 } } },
  li: { label: 'Licht (an der Wand, stört keine Bodenfläche)', vars: { leiste: { name: 'LED-Lichtleiste indirekt (über Spiegel oder in Nische)', w: 1.2, d: .05, y: 2.3, price: 149 }, wand: { name: 'Wandleuchte', w: .12, d: .1, y: 1.8, price: 119 } }, size: { w: [.1, 3], y: [.3, 2.45] } },
  tw: { label: 'Trennwand (steht senkrecht zur Wand und ragt in den Raum, z. B. zwischen Dusche und WC)', vars: { halb: { name: 'Trennwand halbhoch 1,20 m, gefliest', w: .12, d: .9, price: 0, perM: 180 }, hoch: { name: 'Trennwand raumhoch, gefliest', w: .12, d: .9, price: 0, perM: 260 } }, size: { d: [.3, 2.6] } },
  vw: { label: 'Vorwand', vars: { v: { name: 'Vorwand mit Ablage, 1,10 m hoch, 20 cm tief', w: 1.2, d: .2, price: 0, perM: 140 } }, size: { w: [.4, 3] } },
  ni: { label: 'Wandnische', vars: { n: { name: 'Wandnische mit LED, 12 cm tief', w: .6, h: .4, y: 1.1, price: 290 } }, size: { w: [.3, 1.5], h: [.2, 1.2], y: [.2, 1.8] } },
};
const TILES_WALL = { weiss: ['Weiß glänzend 30 × 60', 29], mattweiss: ['Weiß matt 30 × 60', 27], hellgrau: ['Hellgrau matt 30 × 60', 27], greige: ['Greige 30 × 60', 29], sand: ['Sand 60 × 120', 45], anthw: ['Anthrazit matt 30 × 60', 32], schwarzw: ['Schwarz matt 30 × 60', 39], beton: ['Betongrau 60 × 120', 49], marmor: ['Marmoroptik 60 × 120', 69], travertin: ['Travertin 60 × 120', 59], salbei: ['Salbei Metro 7,5 × 15', 39], creme: ['Creme Metro 7,5 × 15', 35], rosa: ['Altrosa Metro 7,5 × 15', 39], hellblau: ['Hellblau Zellige 10 × 10', 79], navy: ['Nachtblau Zellige 10 × 10', 89] };
const TILES_FLOOR = { weissf: ['Weiß matt 60 × 60', 33], grauf: ['Hellgrau 60 × 60', 32], greigef: ['Greige 60 × 60', 35], sandf: ['Sand 60 × 120', 45], anthrazit: ['Anthrazit 60 × 60', 39], schwarzf: ['Schwarz matt 60 × 60', 39], eiche: ['Holzoptik Eiche 20 × 120', 45], eichehell: ['Eiche hell 20 × 120', 49], nuss: ['Nussbaum 20 × 120', 55], betonf: ['Betonoptik 60 × 60', 39], terrazzo: ['Terrazzo 60 × 60', 59], marmorb: ['Marmoroptik 60 × 60', 69] };
const GROUT = { auto: 'passend zur Fliese', hell: 'hell', grau: 'grau', dunkel: 'anthrazit' };
const FINISH = { chrom: ['Chrom', 0], edel: ['Edelstahl gebürstet', 40], schwarz: ['Schwarz matt', 60], gold: ['Gold gebürstet', 90] };
const FURN = { eiche: 'Eiche', eichehell: 'Eiche hell', nuss: 'Nussbaum', weiss: 'Weiß Hochglanz', weissm: 'Weiß matt', beige: 'Kaschmir (warmes Beige)', anth: 'Anthrazit', gruen: 'Salbeigrün' };
const PLACEABLE = Object.keys(CATALOG);
const FLOOR_TYPES = ['wc', 'wt', 'du', 'wa', 'hk', 'vw', 'tw', 'mo'];

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
  return { w: it.w ?? v.w, d: it.d ?? (v.d || 0), h: it.h ?? v.h, y: it.y ?? v.y };
}

// ---------- Montageflächen (wie im Planer: Raumwände, beide Seiten freier Wände, beide Seiten von Trennwänden) ----------
function mounts(plan) {
  const out = walls(plan.pts).map((w, i) => ({ ...w, n: [-w.d[1], w.d[0]], key: i, name: `W${i + 1}` }));
  const fws = plan.items.filter(it => it.type === 'fw' && it.a && it.b), h = .06;
  fws.forEach((f, k) => {
    const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], l = Math.hypot(dx, dz) || .001, d = [dx / l, dz / l], n = [-d[1], d[0]];
    out.push({ key: 'f' + f.id + 'p', fw: f.id, A: [f.a[0] + n[0] * h, f.a[1] + n[1] * h], len: l, d, n, name: `F${k + 1}A` });
    out.push({ key: 'f' + f.id + 'm', fw: f.id, A: [f.b[0] - n[0] * h, f.b[1] - n[1] * h], len: l, d: [-d[0], -d[1]], n: [-n[0], -n[1]], name: `F${k + 1}B` });
  });
  const roomW = out.slice();
  plan.items.filter(it => it.type === 'tw').forEach((tw, k) => {
    const base = roomW.find(m => m.key === tw.wall) || roomW[0], L = Math.max(dimsOf(tw).d, .05), P = s0 => [base.A[0] + base.d[0] * s0, base.A[1] + base.d[1] * s0];
    const am = P(tw.t - h), ap = P(tw.t + h);
    out.push({ key: 't' + tw.id + 'm', tw: tw.id, A: am, len: L, d: base.n, n: [-base.d[0], -base.d[1]], name: `T${k + 1}A` });
    out.push({ key: 't' + tw.id + 'p', tw: tw.id, A: [ap[0] + base.n[0] * L, ap[1] + base.n[1] * L], len: L, d: [-base.n[0], -base.n[1]], n: base.d, name: `T${k + 1}B` });
  });
  return out;
}
const mountOf = (it, ms) => (it.host && ms.find(m => m.key === it.host)) || ms.find(m => m.key === it.wall) || ms[0];

// ---------- Prüfung der KI-Ergebnisse (echte Flächen im Raum) ----------
function insidePoly(pts, x, z) { let c = false; pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }); return c; }
function rectOf(m, u0, u1, v0, v1) { const P = (u, v) => [m.A[0] + m.d[0] * u + m.n[0] * v, m.A[1] + m.d[1] * u + m.n[1] * v]; return [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)]; }
function overlap(p, q) { // Trennachsen-Test für zwei konvexe Vierecke
  for (const poly of [p, q]) for (let i = 0; i < 4; i++) {
    const a = poly[i], b = poly[(i + 1) % 4], ax = -(b[1] - a[1]), az = b[0] - a[0];
    const pr = r => r.map(c => c[0] * ax + c[1] * az), P = pr(p), Q = pr(q);
    if (Math.max(...P) <= Math.min(...Q) || Math.max(...Q) <= Math.min(...P)) return false;
  }
  return true;
}
function nameOf(it) { if (it.type === 'tu') return 'Tür (Schwenkbereich)'; if (it.type === 'fw') return 'freistehende Wand'; return CATALOG[it.type].vars[it.v].name; }
function conflicts(plan) {
  const ms = mounts(plan), out = [], S = .03;
  const fl = plan.items.filter(it => it.type === 'tu' || it.type === 'fw' || (FLOOR_TYPES.includes(it.type) && !(it.type === 'mo' && it.v === 'regal')));
  const shapes = fl.map(it => {
    if (it.type === 'fw') { const dx = it.b[0] - it.a[0], dz = it.b[1] - it.a[1], l = Math.hypot(dx, dz) || .001, m = { A: it.a, d: [dx / l, dz / l], n: [-dz / l, dx / l] }; return { it, r: rectOf(m, S, l - S, -.06 + S, .06 - S), m, at: 'frei' }; }
    const m = mountOf(it, ms), D = dimsOf(it.type === 'tu' ? { ...it, type: 'ni', v: 'n' } : it), w = it.type === 'tu' ? (it.w ?? .86) : D.w, d = it.type === 'tu' ? w : D.d, o = it.off || 0;
    return { it, m, at: m.name, w, d, o, r: rectOf(m, it.t - w / 2 + S, it.t + w / 2 - S, o + S, o + d - S) };
  });
  shapes.forEach(s => {
    if (s.it.type === 'fw' || s.it.type === 'tu') return;
    if (s.it.t - s.w / 2 < -.02 || s.it.t + s.w / 2 > s.m.len + .02) out.push(`${nameOf(s.it)} ragt über ${s.at} hinaus (${s.at} ist ${de(s.m.len)} m lang, Objekt ${de(s.w)} m breit, abstand ${de(s.it.t)}).`);
    else if (!s.r.every(c => insidePoly(plan.pts, c[0], c[1]))) out.push(`${nameOf(s.it)} an ${s.at} ragt aus dem Raum heraus.`);
  });
  for (let i = 0; i < shapes.length; i++) for (let j = i + 1; j < shapes.length; j++) {
    const p = shapes[i], q = shapes[j];
    if (p.it.type === 'tu' && q.it.type === 'tu') continue;
    const host = (x, y) => x.it.host && y.it.id != null && (x.it.host === 'f' + y.it.id + 'p' || x.it.host === 'f' + y.it.id + 'm' || x.it.host === 't' + y.it.id + 'p' || x.it.host === 't' + y.it.id + 'm');
    if (host(p, q) || host(q, p)) continue;
    if (overlap(p.r, q.r)) out.push(`${nameOf(p.it)} (${p.at}) und ${nameOf(q.it)} (${q.at}) überschneiden sich.`);
  }
  // Bewegungsfläche vor WC, Waschtisch und Wanne
  shapes.filter(s => ['wc', 'wt', 'wa'].includes(s.it.type)).forEach(s => {
    const front = rectOf(s.m, s.it.t - s.w / 2 + .08, s.it.t + s.w / 2 - .08, s.o + s.d + S, s.o + s.d + .55);
    const blocked = shapes.find(q => q !== s && q.it.type !== 'tu' && overlap(front, q.r));
    if (blocked) out.push(`Vor ${nameOf(s.it)} (${s.at}) ist zu wenig Platz: ${nameOf(blocked.it)} steht im Weg (mind. 55 cm frei lassen).`);
    else if (!front.every(c => insidePoly(plan.pts, c[0], c[1]))) out.push(`Vor ${nameOf(s.it)} (${s.at}) ist zu wenig Platz bis zur Wand (mind. 55 cm frei lassen).`);
  });
  return [...new Set(out)];
}

// ---------- Plan aus KI-Antwort bauen ----------
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function keepMaterial(base) {
  const k = ['wall', 'floor', 'grout', 'tileH', 'finish', 'furn', 'accent', 'accentTile', 'mood', 'deko', 'fbh', 'luefter'], o = {};
  k.forEach(x => { if (base[x] !== undefined) o[x] = base[x]; }); return o;
}
function normalize(base, e, layoutOnly) {
  const W = walls(base.pts), n = W.length;
  const m = e.material || {};
  const plan = layoutOnly ? { H: base.H || 2.5, pts: base.pts, wall: 'weiss', floor: 'eiche', grout: 'auto', tileH: 'voll', finish: 'chrom', furn: 'eiche', accent: null, accentTile: 'navy', mood: 'tag', deko: true, ...keepMaterial(base), items: [] } : {
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
  (base.items || []).filter(it => it.type === 'tu' || it.type === 'fe' || (it.type === 'fw' && !(layoutOnly && it.ki))).forEach(it => plan.items.push({ ...it, id: id++ }));
  // neue freistehende Wände (T-Lösung, Raumteiler)
  const xs = base.pts.map(p => p[0]), zs = base.pts.map(p => p[1]), inBox = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= Math.min(...xs) - .01 && p[0] <= Math.max(...xs) + .01 && p[1] >= Math.min(...zs) - .01 && p[1] <= Math.max(...zs) + .01;
  (Array.isArray(e.freiewaende) ? e.freiewaende : []).slice(0, 4).forEach(f => {
    const a = (f.von || []).map(Number), b = (f.bis || []).map(Number);
    if (!inBox(a) || !inBox(b) || Math.hypot(b[0] - a[0], b[1] - a[1]) < .3) return;
    plan.items.push({ id: id++, type: 'fw', v: f.hoehe === 'halb' ? 'halb' : 'hoch', a: a.map(r2), b: b.map(r2), ki: true });
  });
  const objs = (Array.isArray(e.objekte) ? e.objekte : []).slice(0, 24).filter(o => CATALOG[o.typ] && CATALOG[o.typ].vars[o.modell]);
  const wallIdx = o => { const s0 = String(o.an || '').toUpperCase().match(/^W(\d+)$/); const v = s0 ? Number(s0[1]) : Math.round(Number(o.wand) || 1); return clamp(v, 1, n) - 1; };
  const make = o => {
    const cat = CATALOG[o.typ], it = { id: id++, type: o.typ, v: o.modell, wall: wallIdx(o), t: 0 };
    if (cat.arms) it.arm = cat.arms[o.armatur] ? o.armatur : Object.keys(cat.arms)[0];
    const v = cat.vars[o.modell];
    if (cat.size) {
      if (cat.size.w) it.w = r2(clamp(Number(o.breite) || v.w, ...cat.size.w));
      if (cat.size.h) it.h = r2(clamp(Number(o.hoehe) || v.h, ...cat.size.h));
      if (cat.size.y) it.y = r2(clamp(Number(o.unterkante) || v.y, ...cat.size.y));
      if (cat.size.d) it.d = r2(clamp(Number(o.laenge) || v.d, ...cat.size.d));
    }
    Object.entries(cat.opts || {}).forEach(([name, op]) => { const val = o[name]; it[op.key] = op.list[val] ? val : Object.keys(op.list)[0]; });
    if (o.gespiegelt === true) it.flip = true;
    if (o.typ === 'wa' && Number(o.abstand_raum) > .1) it.off = r2(clamp(Number(o.abstand_raum), 0, 3));
    return it;
  };
  // erst Trennwände (andere Objekte können daran hängen), dann der Rest
  const tws = objs.filter(o => o.typ === 'tw').map(o => { const it = make(o); plan.items.push(it); return { o, it }; });
  tws.forEach(({ o, it }) => { const L = W[it.wall].len; it.t = r2(clamp(Number(o.abstand) || L / 2, .06, L - .06)); });
  objs.filter(o => o.typ !== 'tw').forEach(o => {
    const it = make(o), ms = mounts(plan), key = String(o.an || '').toUpperCase(), mm = key.match(/^([FT])(\d+)([AB])$/);
    let m = null, a0 = Number(o.abstand);
    if (mm) {
      m = ms.find(x => x.name === key);
      if (m) { it.host = m.key; if (Number.isFinite(a0) && mm[3] === 'B') a0 = m.len - a0; } // Seite B läuft andersherum: abstand ab von/Wand umrechnen
    }
    if (!m) m = ms.find(x => x.key === it.wall);
    const w = dimsOf(it).w, L = m.len;
    it.t = r2(clamp(Number.isFinite(a0) ? a0 : L / 2, Math.min(w / 2, L / 2), Math.max(L - w / 2, L / 2)));
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
- Zu jedem WC gehören ein Toilettenpapierhalter (ac papier) und eine WC-Bürstengarnitur (ac buerste) auf derselben Wand direkt neben dem WC (ca. 30–45 cm neben der WC-Mitte). Plane außerdem passende Accessoires ein: Seifenspender oder Glasablage beim Waschtisch, Handtuchhaken oder -stange bei Dusche/Wanne, bei barrierefrei Haltegriffe und Duschklappsitz. Accessoires hängen an der Wand und dürfen sich mit Bodenobjekten überschneiden.
- Duschabtrennung (Feld trennung): wähle passend zum Stil. Gemauerte Wände wirken wohnlich und sind pflegeleicht, Glas wirkt offen und großzügig. Eine Trennwand (tw) eignet sich z. B. als Sichtschutz zwischen Dusche und WC; ihre laenge ist, wie weit sie in den Raum ragt.
- Duschen sind heute meist bodengleich mit Duschrinne (Feld boden = eben, ablauf = rinne oder rinnef). Eine befliesbare Rinne wirkt besonders ruhig, ein Wandablauf ist am elegantesten.
- Licht: eine LED-Lichtleiste über dem Spiegel oder eine Wandleuchte macht das Bad wohnlich.
- Bei kleinen Bädern (unter 4 m²) eher Handwaschbecken oder 60er Waschtisch, Spiegelschrank für Stauraum.
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
  const pt = q => `(${de(q[0])} | ${de(q[1])})`;
  W.forEach((w, i) => lines.push(`W${i + 1}: Länge ${de(w.len)} m, von Ecke ${i + 1} ${pt(w.A)} zu Ecke ${(i + 1) % n + 1} ${pt(w.B)}. Am Wandende: ${cornerKind(W, i)} zu W${(i + 1) % n + 1}.`));
  const fws = (base.items || []).filter(it => it.type === 'fw' && Array.isArray(it.a) && Array.isArray(it.b));
  if (fws.length) {
    lines.push('\nFREISTEHENDE WÄNDE (vom Berater gesetzt, bleiben fest, Koordinaten in m wie bei den Ecken, 12 cm dick)');
    const dir = v => Math.abs(v[0]) > Math.abs(v[1]) ? (v[0] > 0 ? '+x' : '−x') : (v[1] > 0 ? '+z' : '−z');
    fws.forEach((f, k) => { const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], l = Math.hypot(dx, dz) || 1, nA = [-dz / l, dx / l];
      lines.push(`- F${k + 1}: ${f.v === 'hoch' ? 'raumhoch' : 'halbhoch 1,20 m'}, von ${pt(f.a)} bis ${pt(f.b)}, ${de(l)} m lang. Seite F${k + 1}A zeigt Richtung ${dir(nA)}, Seite F${k + 1}B Richtung ${dir([-nA[0], -nA[1]])}. Objekte können an beide Seiten (an = "F${k + 1}A" oder "F${k + 1}B", abstand ab dem von-Punkt).`); });
  }
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
    if (c.size) lines.push(`   anpassbar: ` + Object.entries(c.size).map(([k, r]) => `${{ w: 'breite', h: 'hoehe', y: 'unterkante', d: 'laenge' }[k]} ${de(r[0])}–${de(r[1])} m`).join(', '));
    Object.entries(c.opts || {}).forEach(([name, op]) => lines.push(`   Feld „${name}“: ` + Object.entries(op.list).map(([id, t]) => `${id} (${t})`).join('; ')));
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
            breite: { type: 'number' }, hoehe: { type: 'number' }, unterkante: { type: 'number' }, laenge: { type: 'number', description: 'nur Trennwand: wie weit sie in den Raum ragt' },
            trennung: { type: 'string', enum: Object.keys(CATALOG.du.opts.trennung.list) }, boden: { type: 'string', enum: Object.keys(CATALOG.du.opts.boden.list) }, ablauf: { type: 'string', enum: Object.keys(CATALOG.du.opts.ablauf.list) }, unterschrank: { type: 'string', enum: Object.keys(CATALOG.wt.opts.unterschrank.list) },
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

async function callClaude(cfg, messages, timeoutMs = 240000, tool = TOOL, system = SYSTEM, field = 'entwuerfe') {
  // Kein erzwungenes Werkzeug (nicht jedes Modell unterstützt das): KI bekommt es angeboten und soll es nutzen.
  const msgs = [...messages];
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await request(cfg, { max_tokens: 32000, system, tools: [tool], tool_choice: { type: 'auto' }, messages: msgs }, timeoutMs);
    const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === tool.name);
    if (use && Array.isArray(use.input?.[field]) && use.input[field].length) return { use, raw: data };
    if (data.stop_reason === 'max_tokens') throw new AiError(502, 'Die Antwort der KI war zu lang. Bitte weniger Ideen auf einmal erstellen.');
    msgs.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
    msgs.push({ role: 'user', content: `Bitte speichere das Ergebnis jetzt mit dem Werkzeug „${tool.name}“. Keine weiteren Erklärungen.` });
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

// ---------- Aufteilungs-Vorschläge (nur Anordnung, Materialien bleiben) ----------
const SYSTEM_L = `Du bist ein erfahrener, kreativer Badplaner in Deutschland und kennst die aktuellen Trends der Badgestaltung.
Du bekommst einen vermessenen Grundriss mit Tür und Fenster. Schlage verschiedene, wirklich baubare AUFTEILUNGEN vor: wo Dusche, WC, Waschtisch, Wanne usw. stehen – auch mit Wänden mitten im Raum.
Speichere IMMER mit dem Werkzeug "aufteilungen_speichern" (alle in einem Aufruf). Kein Text außerhalb des Werkzeugs.

Koordinaten: Meter, x nach rechts, z nach unten (wie im Grundriss). Die Ecken stehen in der Raumbeschreibung.

Wo ein Objekt hängt ("an"):
- "W1", "W2" …: Raumwand. abstand = Objektmitte ab Wandanfang. Das Objekt ragt in den Raum.
- Freistehende Wände legst du selbst im Feld "freiewaende" an (von/bis als [x, z], 12 cm dick, hoehe "hoch" oder "halb" = 1,20 m). Sie heißen in Reihenfolge F1, F2 … (bereits vorhandene freistehende Wände zählen zuerst, siehe Raumbeschreibung).
  Ein Ende darf eine Raumwand berühren (das ist die klassische T-Lösung: Wand vom Raumrand in den Raum) – dann liegt das Ende genau auf der Raumwand.
  Jede freistehende Wand hat zwei Seiten: "F1A" und "F1B". Seite A zeigt in Richtung (−dz, dx), wenn (dx, dz) die Richtung von "von" nach "bis" ist. Beispiel: von [1, 0] bis [1, 1,5] → Richtung (0, 1) → Seite A zeigt nach −x (links), Seite B nach +x (rechts).
  abstand auf F-Seiten = Objektmitte ab dem von-Punkt entlang der Wand.
- Trennwand "tw" (steht senkrecht auf einer Raumwand, laenge = wie weit sie in den Raum ragt). Sie heißen in Reihenfolge der tw-Objekte T1, T2 … Seiten: "T1A" (zeigt zum Wandanfang der Raumwand) und "T1B" (zeigt zum Wandende). abstand auf T-Seiten = Objektmitte ab der Raumwand.
- Badewanne frei im Raum: an eine Wand hängen und "abstand_raum" (Abstand von der Wand in m) setzen, z. B. freistehende Wanne 0,4–0,8 m vor der Wand oder vor dem Fenster.

Typische moderne Lösungen (nutze sie, wo der Raum es hergibt):
- T-Lösung: raumhohe oder halbhohe Wand in den Raum, dahinter Walk-in-Dusche (ohne Glastür), davor Waschtisch an der Wand selbst.
- WC-Nische: WC hinter einer halbhohen Trennwand oder zwischen Trennwand und Raumwand, vom Eingang nicht direkt sichtbar.
- Raumteiler mit Waschtisch: halbhohe freistehende Wand mitten im Raum, Waschtisch und Spiegel an einer Seite, Dusche oder Wanne an der anderen.
- Walk-in über die ganze Raumbreite am Ende des Raums (Nasszone), gemauert oder mit Glas.
- Freistehende Wanne als Blickfang (vor dem Fenster oder mittig), Dusche separat.
- Klassisch an den Wänden: alles an den Raumwänden, maximal offen und günstig.
- Doppelwaschtisch für Paare, Dusch-WC, Platz für Waschmaschine, viel Stauraum – je nach Wünschen.

Regeln:
- Objekte dürfen sich nicht überschneiden, nicht in Wänden stehen und nicht aus dem Raum ragen. Vor WC, Waschtisch, Wanne und Duscheinstieg mindestens 60–75 cm frei.
- Die Tür und ihr Schwenkbereich (Türbreite tief) bleiben frei. Fenster mit niedriger Brüstung nicht zustellen.
- Wand-WC und Dusch-WC brauchen eine Vorwand, die ist enthalten – das WC kann deshalb auch an eine Trennwand oder freistehende Wand (mindestens halbhoch).
- Zu jedem WC: Toilettenpapierhalter (ac papier) und WC-Bürste (ac buerste) an derselben Fläche daneben. Spiegel (sp) über dem Waschtisch an derselben Fläche, gleicher abstand. Handtuchheizkörper an eine freie Wandfläche. Duschen bodengleich mit Rinne.
- Mindestens 1,20 m breit für einen Durchgang hinter einer Wand in eine Walk-in-Dusche ist großzügig, 0,70 m ist das Minimum.
- Jede Aufteilung soll sich in der ANORDNUNG klar unterscheiden. Wenn der Raum für eine Lösung zu klein ist, lass sie weg.
- titel: 2–4 Wörter. beschreibung: 2 kurze Sätze für den Endkunden, warum diese Anordnung gut ist. trend: ein kurzer Satz, welchen aktuellen Trend sie aufgreift (aus der Trend-Recherche).`;
const TOOL_L = {
  name: 'aufteilungen_speichern',
  description: 'Speichert die Aufteilungs-Vorschläge für das Bad.',
  input_schema: {
    type: 'object', required: ['aufteilungen'],
    properties: {
      aufteilungen: { type: 'array', minItems: 1, maxItems: 6, items: {
        type: 'object', required: ['titel', 'konzept', 'beschreibung', 'objekte'],
        properties: {
          titel: { type: 'string' },
          konzept: { type: 'string', enum: ['t_loesung', 'wc_nische', 'raumteiler', 'nasszone', 'freistehende_wanne', 'klassisch', 'sonstiges'] },
          beschreibung: { type: 'string' }, trend: { type: 'string' },
          freiewaende: { type: 'array', items: { type: 'object', required: ['von', 'bis', 'hoehe'], properties: {
            von: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, bis: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 }, hoehe: { type: 'string', enum: ['hoch', 'halb'] } } } },
          objekte: { type: 'array', items: { type: 'object', required: ['typ', 'modell', 'an', 'abstand'], properties: {
            typ: { type: 'string', enum: PLACEABLE }, modell: { type: 'string' }, armatur: { type: 'string' },
            an: { type: 'string', description: 'W1…, F1A/F1B…, T1A/T1B…' },
            abstand: { type: 'number' }, abstand_raum: { type: 'number', description: 'nur Wanne: Abstand von der Fläche in den Raum' },
            breite: { type: 'number' }, hoehe: { type: 'number' }, unterkante: { type: 'number' }, laenge: { type: 'number', description: 'nur Trennwand tw' },
            trennung: { type: 'string', enum: Object.keys(CATALOG.du.opts.trennung.list) }, boden: { type: 'string', enum: Object.keys(CATALOG.du.opts.boden.list) }, ablauf: { type: 'string', enum: Object.keys(CATALOG.du.opts.ablauf.list) }, unterschrank: { type: 'string', enum: Object.keys(CATALOG.wt.opts.unterschrank.list) },
            gespiegelt: { type: 'boolean' },
          } } },
        } } },
    },
  },
};
const KONZEPT = { t_loesung: 'T-Lösung', wc_nische: 'WC-Nische', raumteiler: 'Raumteiler', nasszone: 'Nasszone', freistehende_wanne: 'Freistehende Wanne', klassisch: 'Klassisch', sonstiges: 'Eigene Idee' };
async function layouts(cfg, base, wishes, count = 5) {
  if (!cfg.key) throw new AiError(400, 'Es ist noch kein KI-Schlüssel hinterlegt. Ein Admin kann ihn unter „KI“ eintragen.');
  if (!base || !Array.isArray(base.pts) || base.pts.length < 3) throw new AiError(400, 'Bitte zuerst den Grundriss zeichnen und bemaßen.');
  const prompt = describe(base, wishes, cfg.trends, cfg.webTrends) + `\n\nAUFGABE\nSchlage ${count} unterschiedliche Aufteilungen für dieses Bad vor (Materialien sind schon gewählt, es geht nur um die Anordnung). Nutze T-Lösung, WC-Nische, Raumteiler, Nasszone oder freistehende Wanne, wo es der Raum hergibt, und mindestens eine klassische, günstige Variante.`;
  const messages = [{ role: 'user', content: prompt }];
  let { use, raw } = await callClaude(cfg, messages, 240000, TOOL_L, SYSTEM_L, 'aufteilungen');
  let plans = use.input.aufteilungen.map(e => ({ e, plan: normalize(base, e, true) }));
  const problems = plans.map((p, i) => ({ i, list: conflicts(p.plan) })).filter(p => p.list.length);
  if (problems.length) {
    const text = 'Beim Prüfen der echten Flächen sind diese Probleme aufgefallen:\n' + problems.map(p => `Aufteilung ${p.i + 1} „${plans[p.i].e.titel}“:\n- ` + p.list.join('\n- ')).join('\n') +
      `\n\nBitte korrigiere die Platzierung (Objekte verschieben, kleinere Modelle oder Aufteilung weglassen) und speichere ALLE Aufteilungen erneut.`;
    try {
      const fix = await callClaude(cfg, [...messages, { role: 'assistant', content: raw.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content: text }] }], 200000, TOOL_L, SYSTEM_L, 'aufteilungen');
      const fixed = fix.use.input.aufteilungen.map(e => ({ e, plan: normalize(base, e, true) }));
      if (fixed.length) plans = fixed;
    } catch (e) { /* erste Version behalten */ }
  }
  // Vorschläge mit vielen Problemen ans Ende
  return plans.map(({ e, plan }) => ({ name: String(e.titel || 'Vorschlag').slice(0, 60), konzept: KONZEPT[e.konzept] || 'Eigene Idee', note: String(e.beschreibung || '').slice(0, 600), trend: String(e.trend || '').slice(0, 300), plan, hinweise: conflicts(plan) }))
    .sort((a, b) => a.hinweise.length - b.hinweise.length);
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

// ---------- KI-Fotos: 3D-Ansicht → fotorealistisches Bild (OpenAI Bild-KI) ----------
const EN = {
  wall: { mattweiss: 'matte white 30x60 cm wall tiles', hellgrau: 'matte light grey 30x60 cm wall tiles', greige: 'warm greige 30x60 cm wall tiles', sand: 'large-format sand-coloured 60x120 cm wall tiles', anthw: 'matte anthracite 30x60 cm wall tiles', schwarzw: 'matte black 30x60 cm wall tiles', travertin: 'travertine-look large-format 60x120 cm wall tiles', creme: 'cream glossy subway tiles 7.5x15 cm', rosa: 'dusty pink glossy subway tiles 7.5x15 cm', hellblau: 'light blue handmade zellige tiles 10x10 cm',
    weiss: 'glossy white 30x60 cm ceramic wall tiles', beton: 'large-format warm grey concrete-look porcelain wall tiles 60x120 cm', salbei: 'sage green glossy subway wall tiles 7.5x15 cm in a brick pattern', marmor: 'white marble-look large-format wall tiles 60x120 cm with soft grey veining', navy: 'deep navy blue handmade zellige wall tiles 10x10 cm with irregular glossy glaze' },
  floor: { weissf: 'matte white 60x60 cm floor tiles', grauf: 'light grey 60x60 cm floor tiles', greigef: 'warm greige 60x60 cm floor tiles', sandf: 'sand-coloured 60x120 cm floor tiles', schwarzf: 'matte black 60x60 cm floor tiles', eichehell: 'light oak wood-look plank floor tiles 20x120 cm', nuss: 'dark walnut wood-look plank floor tiles 20x120 cm', betonf: 'concrete-look 60x60 cm floor tiles',
    eiche: 'natural oak wood-look porcelain plank floor tiles 20x120 cm', anthrazit: 'anthracite stone-look floor tiles 60x60 cm', terrazzo: 'light terrazzo floor tiles 60x60 cm with small colourful chips', marmorb: 'white marble-look floor tiles 60x60 cm' },
  finish: { chrom: 'polished chrome', edel: 'brushed stainless steel', schwarz: 'matte black', gold: 'brushed gold' },
  furn: { eichehell: 'light oak wood', nuss: 'walnut wood', weissm: 'matte white lacquer', beige: 'warm cashmere beige matte lacquer', eiche: 'natural oak wood', weiss: 'high-gloss white lacquer', anth: 'matte anthracite', gruen: 'matte sage green' },
  grout: { auto: 'matching', hell: 'light', grau: 'grey', dunkel: 'dark anthracite' },
  obj: { 'ar:wtwand': 'wall-mounted basin tap', 'ar:up': 'concealed thermostatic shower valve', 'ar:kopf': 'wall-arm overhead rain shower', 'ar:regen': 'exposed rain shower set', 'ar:hand': 'hand shower on a wall holder', 'ar:stange': 'shower rail with hand shower', 'ar:wanne': 'wall-mounted bath mixer', 'hk:paneel': 'flat vertical design radiator panel', 'li:leiste': 'indirect LED light strip', 'li:wand': 'modern wall light', 'fw:halb': 'tiled free-standing half-height partition wall (1.2 m) with a ceramic top', 'fw:hoch': 'tiled free-standing floor-to-ceiling partition wall', 'wc:bidet': 'wall-hung white bidet', 'wt:h45': 'small wall-hung hand basin 45 cm', 'wt:w100': '100 cm washbasin with wall-hung vanity', 'wt:w140': '140 cm double washbasin with wall-hung vanity', 'wt:auf2': 'two countertop vessel basins on a 140 cm wall-hung console', 'sp:up': 'flush recessed mirror cabinet', 'sp:oval': 'oval mirror', 'sp:pur': 'simple rectangular mirror', 'du:walk140': 'large level-access walk-in shower 140 cm with linear drain', 'hk:hk60': 'tall heated towel rail', 'tw:halb': 'tiled half-height partition wall 1.2 m with a ceramic top', 'tw:hoch': 'tiled floor-to-ceiling partition wall', 'mo:hoch': 'tall wall-hung bathroom cabinet', 'mo:seite': 'wall-hung side cabinet', 'mo:regal': 'two floating wall shelves', 'mo:wm': 'white front-loading washing machine', 'ac:papier': 'toilet roll holder', 'ac:ersatz': 'spare toilet roll holder', 'ac:buerste': 'toilet brush holder', 'ac:haken': 'towel hook with towel', 'ac:stange': 'towel bar with towel', 'ac:ring': 'towel ring', 'ac:seife': 'wall-mounted soap dispenser', 'ac:ablage': 'glass shelf', 'ac:duschkorb': 'shower shelf', 'ac:griff': 'grab bar', 'ac:sitz': 'fold-down shower seat',
    'wc:wand': 'wall-hung rimless white toilet with flush plate on a tiled pre-wall', 'wc:stand': 'floor-standing white toilet with ceramic cistern', 'wc:dusch': 'wall-hung shower toilet (bidet toilet) on a tiled pre-wall',
    'wt:w60': '60 cm washbasin with wall-hung vanity cabinet', 'wt:w80': '80 cm washbasin with wall-hung vanity cabinet', 'wt:w120': '120 cm double washbasin with wall-hung vanity', 'wt:auf': 'round countertop vessel basin on a 100 cm wall-hung console',
    'sp:led': 'backlit LED mirror', 'sp:schrank': 'mirror cabinet with LED light', 'sp:rund': 'round mirror with soft backlight',
    'du:walk': 'level-access walk-in shower with a frameless glass panel and linear floor drain', 'du:eck': 'corner shower with frameless glass door', 'du:nische': 'alcove shower with a frameless glass door',
    'wa:r170': 'built-in bathtub with tiled front', 'wa:r180': 'large built-in bathtub with tiled front', 'wa:frei': 'freestanding oval white bathtub',
    'hk:hk': 'heated towel rail', 'vw:v': 'tiled half-height pre-wall with a shelf', 'ni:n': 'tiled wall niche with LED strip', 'fe:f': 'window with natural daylight', 'tu:t': 'interior door' },
  arm: { 'wt:stand': 'basin mixer tap', 'wt:hoch': 'tall basin mixer tap', 'wt:wand': 'wall-mounted basin tap', 'du:regen': 'exposed rain shower set', 'du:up': 'concealed thermostatic shower with large ceiling rain head', 'du:hand': 'shower rail with hand shower', 'wa:wand': 'wall-mounted bath mixer', 'wa:stand': 'floor-standing freestanding bath mixer' },
};
function photoPrompt(plan, kind) {
  const p = plan || {}, items = p.items || [];
  const fin = EN.finish[p.finish] || 'polished chrome';
  const objs = [...new Set(items.map(it => {
    const o = EN.obj[it.type + ':' + it.v]; if (!o) return null;
    const a = it.arm && EN.arm[it.type + ':' + it.arm];
    let x = a ? `${o} (${fin} ${a})` : o;
    if (it.type === 'du' && it.glas) x += ', ' + ({ klar: 'frameless clear glass panel', schwarz: 'clear glass with slim matte black frame', milch: 'frosted satin glass panel', mauerhalb: 'tiled half-height masonry wall with clear glass on top', mauer: 'tiled floor-to-ceiling masonry wall instead of glass' })[it.glas];
    if (it.type === 'du') x += ', ' + (it.boden === 'wanne' ? 'low flat shower tray' : 'floor-level tiled shower floor') + (it.boden === 'wanne' ? '' : ', ' + ({ rinne: 'stainless steel linear drain', rinnef: 'tile-insert linear drain in the floor tile colour', rinnes: 'matte black linear drain', wand: 'hidden wall drain (no visible floor drain)', punkt: 'square point drain' })[it.ablauf || 'rinne']);
    if (it.type === 'wt' && it.sch) x += ', ' + ({ schub: 'vanity with drawers', tuer: 'vanity with doors', offen: 'open vanity shelf' })[it.sch];
    if (it.type === 'ac' || it.type === 'ar') x += ` in ${fin}`;
    return x;
  }).filter(Boolean))];
  const accent = p.accent != null && EN.wall[p.accentTile] ? ` One accent wall is clad in ${EN.wall[p.accentTile]}.` : '';
  const half = p.tileH === 'halb' ? ' Wall tiles go up to 1.20 m height, above that the walls are painted in a soft warm white.' : ' Wall tiles go up to the ceiling.';
  const light = p.mood === 'abend' ? 'Warm, cosy evening light from recessed ceiling spots and the backlit mirror.' : 'Soft natural daylight' + (items.some(i => i.type === 'fe') ? ' coming through the window' : '') + ', complemented by recessed ceiling spots.';
  const look = `Materials: walls in ${EN.wall[p.wall] || EN.wall.weiss} with ${EN.grout[p.grout] || 'matching'} grout.${half}${accent} Floor in ${EN.floor[p.floor] || EN.floor.eiche}. Vanity furniture in ${EN.furn[p.furn] || 'natural oak wood'}. All taps and metal fittings in ${fin}.
Fixtures in this bathroom (show only those that are visible in the image): ${objs.join('; ') || 'standard bathroom fixtures'}.
${light}
${p.deko === false ? 'No decoration.' : 'Tasteful minimal styling: folded towels, a small plant, a soap dispenser.'}`;
  if (kind === 'pano') return `This image is a 360° equirectangular panorama (2:1) rendered from a simple 3D model of a bathroom, seen from one standing point at eye level.
Turn it into a photorealistic 360° equirectangular panorama photograph of the same newly renovated bathroom in a German home.
VERY IMPORTANT: keep the exact equirectangular projection and spherical distortion of the input. Keep the horizon exactly in the vertical middle. Keep every wall, edge, door, window and fixture at exactly the same pixel position and size. Ceiling stays at the top, floor at the bottom. The left and right edges of the image must connect seamlessly. Do not crop, do not zoom, do not reframe, do not straighten the curved lines, do not turn it into a normal flat photo.
Replace the plain 3D look with real materials, real textures, physically correct light, soft shadows and natural reflections.
${look}
Style: high-end real-estate 360° virtual tour photography, sharp, natural colours, no people, no text, no watermark, no logos.`;
  return `Turn this simple 3D render into a photorealistic interior photograph of a newly renovated bathroom in a German home.
Keep EXACTLY the same camera position, perspective, room shape, wall positions, window and door positions, and the position, size and type of every fixture shown in the render. Do not add, remove or move fixtures. Do not change the layout.
Replace the plain 3D look with real materials, real textures, physically correct light, soft shadows and natural reflections.
${look}
Style: high-end architectural interior photography, shot on a full-frame camera with a 24 mm lens, eye level, sharp, natural colours, no people, no text, no watermark, no logos.`;
}
async function photo(cfg, dataUrl, plan, kind) {
  if (!cfg.openaiKey) throw new AiError(400, 'Für echte Fotos fehlt noch der Schlüssel für die Bild-KI (OpenAI). Ein Admin kann ihn unter „KI“ eintragen.');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl || '')) throw new AiError(400, 'Kein gültiges Bild der Ansicht erhalten.');
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
  const body = { images: [{ image_url: dataUrl }], prompt: photoPrompt(plan, kind), size: kind === 'pano' ? '2048x1024' : '1536x1024', quality: cfg.imageQuality || 'high', output_format: 'jpeg', n: 1 };
  if (cfg.imageModel) body.model = cfg.imageModel;
  // möglichst nah an der Vorlage bleiben (Kanten und Objekte nicht verschieben); Modelle ohne diese Option bekommen die Anfrage ohne
  body.input_fidelity = 'high';
  const send = () => fetch(base + '/v1/images/edits', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.openaiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
  let r, data;
  try {
    r = await send(); data = await r.json().catch(() => ({}));
    if (!r.ok && /input_fidelity/i.test(data?.error?.message || '') ) { delete body.input_fidelity; r = await send(); data = await r.json().catch(() => ({})); }
  }
  catch { throw new AiError(504, 'Die Bild-KI hat nicht rechtzeitig geantwortet. Bitte noch einmal versuchen.'); }
  if (!r.ok) {
    const msg = data?.error?.message || '', code = data?.error?.code || '';
    const orig = msg ? ` (OpenAI: ${msg})` : ` (Fehlercode ${r.status})`;
    if (r.status === 401) throw new AiError(502, 'Der Schlüssel für die Bild-KI ist ungültig. Bitte unter „KI“ prüfen.' + orig);
    if (code === 'insufficient_quota' || /quota|billing|credit/i.test(msg)) throw new AiError(402, 'Das Guthaben bei OpenAI reicht nicht. Bitte unter platform.openai.com → Billing aufladen.' + orig);
    if (/verif/i.test(msg)) throw new AiError(502, 'OpenAI verlangt für die Bild-KI eine Verifizierung deiner Organisation (platform.openai.com → Settings → Organization).' + orig);
    if (r.status === 429) throw new AiError(503, 'Die Bild-KI ist gerade ausgelastet. Bitte gleich noch einmal versuchen.' + orig);
    if (kind === 'pano' && /size/i.test(msg)) throw new AiError(502, 'Das eingestellte Bild-Modell kann keine 360°-Größe (2048 × 1024). Bitte unter „KI“ das Feld „Bild-Modell“ leer lassen, damit das aktuelle Standardmodell genutzt wird.' + orig);
    throw new AiError(502, 'Die Bild-KI hat einen Fehler gemeldet.' + orig);
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new AiError(502, 'Die Bild-KI hat kein Bild geliefert. Bitte noch einmal versuchen.');
  return Buffer.from(b64, 'base64');
}
async function testImage(cfg) {
  if (!cfg.openaiKey) throw new AiError(400, 'Kein Schlüssel für die Bild-KI eingetragen.');
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
  let r; try { r = await fetch(base + '/v1/models', { headers: { authorization: 'Bearer ' + cfg.openaiKey }, signal: AbortSignal.timeout(20000) }); } catch { throw new AiError(504, 'Keine Verbindung zu OpenAI.'); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new AiError(400, 'Der Schlüssel ist ungültig.');
  if (!r.ok) throw new AiError(400, 'OpenAI meldet: ' + (d?.error?.message || r.status));
  const img = (d.data || []).map(m => m.id).filter(id => /image/.test(id));
  return { ok: true, models: img };
}

module.exports = { layouts, mounts, design, test, refreshTrends, listModels, photo, photoPrompt, testImage, conflicts, normalize, describe, AiError, CATALOG };
