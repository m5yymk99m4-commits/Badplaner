/* Badplaner – Planungs-Assistent
   Plant ein Bad wie ein erfahrener Badplaner: probiert für den Grundriss viele Anordnungen
   (Ecke, T-Lösung, Raumteiler, Nasszone, WC-Nische, Wanne frei/eingebaut), prüft jede mit echten Maßen
   und bewertet sie nach Planerregeln. Läuft in Millisekunden direkt im Browser (und auf dem Server).
   Benötigt geo.js (GEO). */
(function (root) {
  const G = typeof module !== 'undefined' && module.exports ? require('./geo.js') : root.GEO;
  const DIM = {
    wc: { wand: [.37, .54], stand: [.37, .68], dusch: [.4, .58] },
    wt: { h45: [.45, .32], w60: [.6, .46], w80: [.8, .48], w100: [1, .48], w120: [1.2, .48], w140: [1.4, .48], auf2: [1.4, .5] },
    wa: { r170: [1.7, .75], r180: [1.8, .8], frei: [1.7, .95] },
    hk: { hk: [.5, .1], hk60: [.6, .1] }, mo: { hoch: [.4, .35], wm: [.62, .62] },
    tw: { halb: [.12, .9], hoch: [.12, .9] },
  };
  const R2 = x => Math.round(x * 1000) / 1000;
  const cm = x => Math.round(x * 100);

  // ---------- Grundgeometrie ----------
  function walls(pts) {
    return pts.map((A, i) => { const B = pts[(i + 1) % pts.length], l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1e-9, d = [(B[0] - A[0]) / l, (B[1] - A[1]) / l];
      return { A, B, len: l, d, n: [-d[1], d[0]], key: i, name: 'Wand ' + (i + 1) }; });
  }
  function dimsOf(it) {
    if (it.type === 'du') return { w: it.w || 1.2, d: it.d || .9 };
    if (it.type === 'tw') return { w: .12, d: it.d || .9 };
    if (it.type === 'tu') return { w: it.w || .86, d: 0 };
    if (it.type === 'fe') return { w: it.w || .9, d: 0 };
    const v = (DIM[it.type] || {})[it.v] || [it.w || .3, it.d || .1];
    return { w: it.w || v[0], d: it.d || v[1] };
  }
  function mounts(pts, items) {
    const out = walls(pts).map(w => ({ ...w })), h = .06;
    let k = 0;
    items.filter(it => it.type === 'fw').forEach(f => { k++;
      const dx = f.b[0] - f.a[0], dz = f.b[1] - f.a[1], l = Math.hypot(dx, dz) || .001, d = [dx / l, dz / l], n = [-d[1], d[0]];
      out.push({ key: 'f' + f.id + 'p', wet: 'f' + f.id, A: [f.a[0] + n[0] * h, f.a[1] + n[1] * h], len: l, d, n, name: 'Trennwand ' + k, inner: true });
      out.push({ key: 'f' + f.id + 'm', wet: 'f' + f.id, A: [f.b[0] - n[0] * h, f.b[1] - n[1] * h], len: l, d: [-d[0], -d[1]], n: [-n[0], -n[1]], name: 'Trennwand ' + k, inner: true });
    });
    const roomW = out.slice();
    items.filter(it => it.type === 'tw').forEach(tw => { k++;
      const base = roomW[tw.wall] || roomW[0], L = dimsOf(tw).d, P = s => [base.A[0] + base.d[0] * s, base.A[1] + base.d[1] * s], am = P(tw.t - h), ap = P(tw.t + h);
      out.push({ key: 't' + tw.id + 'm', wet: 't' + tw.id, A: am, len: L, d: base.n, n: [-base.d[0], -base.d[1]], name: 'Trennwand ' + k, inner: true });
      out.push({ key: 't' + tw.id + 'p', wet: 't' + tw.id, A: [ap[0] + base.n[0] * L, ap[1] + base.n[1] * L], len: L, d: [-base.n[0], -base.n[1]], n: base.d, name: 'Trennwand ' + k, inner: true });
    });
    return out;
  }
  const mountOf = (it, ms) => (it.host && ms.find(m => m.key === it.host)) || ms.find(m => m.key === it.wall) || ms[0];
  const P = (m, u, v) => [m.A[0] + m.d[0] * u + m.n[0] * v, m.A[1] + m.d[1] * u + m.n[1] * v];
  const quadM = (m, u0, u1, v0, v1) => G.quad(m.A, m.d, m.n, u0, u1, v0, v1);
  function overlap(p, q) {
    for (const poly of [p, q]) for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ax = -(b[1] - a[1]), az = b[0] - a[0];
      let pmin = Infinity, pmax = -Infinity, qmin = Infinity, qmax = -Infinity;
      p.forEach(c => { const x = c[0] * ax + c[1] * az; if (x < pmin) pmin = x; if (x > pmax) pmax = x; });
      q.forEach(c => { const x = c[0] * ax + c[1] * az; if (x < qmin) qmin = x; if (x > qmax) qmax = x; });
      if (pmax <= qmin + 1e-6 || qmax <= pmin + 1e-6) return false;
    }
    return true;
  }
  const shrink = (poly, e) => { const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cz = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return poly.map(p => { const dx = p[0] - cx, dz = p[1] - cz, l = Math.hypot(dx, dz) || 1; return [p[0] - dx / l * e, p[1] - dz / l * e]; }); };
  const segX = (a, b, c, d) => { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0; };
  const segDist = (p, a, b) => { const vx = b[0] - a[0], vz = b[1] - a[1], l = vx * vx + vz * vz || 1e-9, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vz) / l)); return Math.hypot(p[0] - a[0] - t * vx, p[1] - a[1] - t * vz); };

  // ---------- Planungszustand ----------
  // solids: belegte Bodenflächen; clears: Flächen, die frei bleiben müssen (vor WC, Waschtisch, Tür …)
  function makeCtx(base) {
    const items = base.items.map(x => ({ ...x }));
    return { pts: base.pts, items, nid: Math.max(0, ...items.map(i => i.id || 0)) + 1, solids: [], clears: [], walls: [], ms: null, notes: [], score: 0 };
  }
  let deadline = Infinity; const late = () => Date.now() > deadline;
  const clone = c => ({ ...c, items: c.items.slice(), solids: c.solids.slice(), clears: c.clears.slice(), walls: c.walls.slice(), notes: c.notes.slice() });
  function refresh(ctx) { // nach dem Setzen von Wänden: Montageflächen und Wand-Hindernisse neu berechnen
    ctx.ms = mounts(ctx.pts, ctx.items); const W = walls(ctx.pts);
    ctx.walls = W.map(w => ({ poly: quadM(w, -.2, w.len + .2, -.2, 0), wall: true, name: w.name }));
    let k = 0;
    ctx.items.forEach(it => {
      if (it.type === 'fw') { k++; const dx = it.b[0] - it.a[0], dz = it.b[1] - it.a[1], l = Math.hypot(dx, dz) || .001, d = [dx / l, dz / l]; const poly = G.quad(it.a, d, [-d[1], d[0]], 0, l, -.06, .06);
        ctx.walls.push({ poly, wall: true, inner: true, name: 'Trennwand ' + k, it, high: it.v === 'hoch' }); }
      if (it.type === 'tw') { k++; const m = W[it.wall]; const poly = quadM(m, it.t - .06, it.t + .06, 0, dimsOf(it).d); ctx.walls.push({ poly, wall: true, inner: true, name: 'Trennwand ' + k, it, high: it.v === 'hoch' }); }
    });
  }
  const insideAll = (ctx, poly) => shrink(poly, .012).every(c => G.pip(ctx.pts, c[0], c[1]));
  const hitsAny = (poly, list, skip) => { if (!list.length) return false; const sp = shrink(poly, .012); return list.some(o => o !== skip && overlap(sp, o.poly)); };
  const innerWalls = ctx => ctx._iw && ctx._iwSrc === ctx.walls ? ctx._iw : (ctx._iwSrc = ctx.walls, ctx._iw = ctx.walls.filter(w => w.inner));
  function doorOf(ctx) {
    const tu = ctx.items.find(i => i.type === 'tu'); if (!tu) return null;
    const W = walls(ctx.pts), m = W[tu.wall] || W[0], w = dimsOf(tu).w;
    return { it: tu, m, w, p: P(m, tu.t, .3), n: m.n, swing: quadM(m, tu.t - w / 2, tu.t + w / 2, 0, w + .05) };
  }
  function windowsOf(ctx) { const W = walls(ctx.pts); return ctx.items.filter(i => i.type === 'fe').map(f => ({ wall: f.wall, u0: f.t - dimsOf(f).w / 2, u1: f.t + dimsOf(f).w / 2, low: (f.y ?? 1.1) < 1.3, m: W[f.wall] })); }
  // sieht man den Punkt von der Tür aus?
  function seen(ctx, q, halfBlocks) {
    const door = doorOf(ctx); if (!door) return { vis: false, facing: false };
    const p = door.p, blocks = ctx.walls.filter(w => w.inner && (w.high || halfBlocks));
    for (const b of blocks) { const poly = b.poly; for (let i = 0; i < poly.length; i++) if (segX(p, q, poly[i], poly[(i + 1) % poly.length])) return { vis: false, facing: false }; }
    for (let s = .1; s < 1; s += .1) { const x = p[0] + (q[0] - p[0]) * s, z = p[1] + (q[1] - p[1]) * s; if (!G.pip(ctx.pts, x, z)) return { vis: false, facing: false }; }
    const dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz) || 1, cos = (dx * door.n[0] + dz * door.n[1]) / l;
    return { vis: true, facing: cos > .87 };
  }

  // ---------- Objekte setzen ----------
  function addItem(ctx, it, extra) {
    it.id = ctx.nid++; ctx.items.push(it);
    if (extra && extra.solid) ctx.solids.push({ poly: extra.solid, it, wall: false, name: extra.name });
    if (extra && extra.clear) ctx.clears.push({ poly: extra.clear, it });
    return it;
  }
  // Kandidaten an allen Montageflächen; front = freie Tiefe davor, side = Seitenabstand
  function candidates(ctx, w, d, opt) {
    const out = [], step = opt.step || .1;
    ctx.ms.forEach(m => {
      if (opt.roomOnly && m.inner) return; if (opt.only && !opt.only(m)) return;
      for (let t = w / 2 + (opt.side || 0); t <= m.len - w / 2 - (opt.side || 0) + 1e-6; t += step) {
        const off = opt.off || 0, solid = quadM(m, t - w / 2, t + w / 2, off, off + d);
        const sideBox = opt.side ? quadM(m, t - w / 2 - opt.side, t + w / 2 + opt.side, off, off + d) : solid;
        const clear = opt.front ? quadM(m, t - w / 2 + (opt.frontInset || 0), t + w / 2 - (opt.frontInset || 0), off + d, off + d + opt.front) : null;
        if (!insideAll(ctx, sideBox)) continue;
        if (hitsAny(sideBox, ctx.solids) || hitsAny(sideBox, innerWalls(ctx)) || hitsAny(solid, ctx.clears)) continue;
        const door = doorOf(ctx); if (door && overlap(shrink(solid, .012), door.swing)) continue;
        if (clear && (!insideAll(ctx, clear) || hitsAny(clear, ctx.solids) || hitsAny(clear, innerWalls(ctx)))) continue;
        out.push({ m, t: R2(t), solid, clear, front: P(m, t, off + d + .05), center: P(m, t, off + d / 2) });
      }
    });
    return out;
  }
  const hostOf = m => typeof m.key === 'number' ? { wall: m.key } : { wall: 0, host: m.key };
  const wetKey = m => m.wet || 'w' + m.key;
  function wetKeys(ctx) { const set = new Set(); ctx.items.forEach(it => { if (it._wet) set.add(it._wet); }); return set; }
  function wetPoints(ctx) { return ctx.items.filter(it => it._wetP).map(it => it._wetP); }
  const windowHit = (ctx, m, u0, u1) => windowsOf(ctx).some(wn => m.key === wn.wall && u1 > wn.u0 + .02 && u0 < wn.u1 - .02);

  // Dusche: in Nische/Ecke einpassen (geo.js), Einstieg muss frei sein
  function placeShower(ctx, m, t, opt = {}) {
    const obs = [...ctx.walls, ...ctx.solids];
    const door = doorOf(ctx); if (door) obs.push({ poly: door.swing, wall: false, name: 'Tür' });
    const mm = { ...m, label: m.name };
    const r = G.fitShower(mm, t, obs, { room: ctx.pts, defW: opt.w || 1.2, defD: opt.d || .9, full: opt.full });
    const mn = opt.min || .9; if (!r || r.w < mn || r.d < mn) return null;
    const solid = quadM(m, r.t - r.w / 2, r.t + r.w / 2, 0, r.d);
    if (!insideAll(ctx, solid) || hitsAny(solid, ctx.solids) || (door && overlap(shrink(solid, .012), door.swing))) return null;
    // Einstieg: 70 cm frei
    const e = r.entry, fd = opt.small ? .6 : .7, cl = e === 'v' ? quadM(m, r.t - r.w / 2 + .1, r.t + r.w / 2 - .1, r.d, r.d + fd) : e === 'r' ? quadM(m, r.t + r.w / 2, r.t + r.w / 2 + fd, .1, r.d - .1) : quadM(m, r.t - r.w / 2 - fd, r.t - r.w / 2, .1, r.d - .1);
    if (!insideAll(ctx, cl) || hitsAny(cl, ctx.solids) || hitsAny(cl, innerWalls(ctx))) return null;
    if (windowHit(ctx, m, r.t - r.w / 2, r.t + r.w / 2)) { ctx.notes.push('Fenster im Duschbereich – Fenster mit Spritzschutz einplanen.'); ctx.score += 1; }
    const armWall = r.sides[r.arm];
    const it = addItem(ctx, { type: 'du', v: 'flex', ...hostOf(m), t: r.t, w: r.w, d: r.d, mass: 'auto', boden: 'eben', ablauf: opt.ablauf || 'rinnef', glas: opt.glass || (r.d >= 1.2 && Object.values(r.sides).filter(s => s.wall).length >= 3 ? 'ohne' : 'klar'), arm: 'up' },
      { solid, clear: cl, name: 'Dusche' });
    it._wet = armWall && armWall.inner ? 'inner' : wetKey(m); it._wetP = P(m, r.t, r.d / 2); it._fit = r;
    it.fit = { sides: r.sides, entry: r.entry, arm: r.arm, drain: r.drain, auto: true };
    return it;
  }
  function bestPlace(ctx, type, vars, opt, scoreFn) {
    let best = null;
    vars.forEach(v => { const [w, d] = DIM[type][v];
      candidates(ctx, w, d, opt).forEach(c => { const s = scoreFn(c, v, w, d); if (s != null && (!best || s < best.s)) best = { ...c, v, w, d, s }; }); });
    return best;
  }
  // Abstand zu den vorhandenen Wasseranschlüssen (kurze Leitungen)
  const plumbing = (ctx, p) => { const ws = wetPoints(ctx); return ws.length ? Math.min(...ws.map(q => Math.hypot(q[0] - p[0], q[1] - p[1]))) : 0; };

  function placeWC(ctx, wish) {
    const had = ctx.items.find(i => i.type === 'wc'); if (had) return had;
    const vars = [wish.duschwc ? 'dusch' : 'wand'];
    const b = bestPlace(ctx, 'wc', vars, { side: wish.small ? .15 : .2, front: wish.small ? .6 : .7, frontInset: -.1 }, c => {
      let s = 0; const sv = seen(ctx, c.front, true);
      if (sv.facing) s += wish.wcHidden ? 6 : 3; else if (sv.vis) s += wish.wcHidden ? 3 : .6;
      if (windowHit(ctx, c.m, c.t - .3, c.t + .3)) s += .3;
      s += .35 * plumbing(ctx, c.center);
      const fr = freeSpan(ctx, c.m, c.t); if (fr && Math.min(c.t - fr[0], fr[1] - c.t) < .45) s += .3;
      return s;
    });
    if (!b) return null;
    const it = addItem(ctx, { type: 'wc', v: b.v, ...hostOf(b.m), t: b.t }, { solid: b.solid, clear: b.clear, name: 'WC' });
    it._wet = wetKey(b.m); it._wetP = b.center; it._m = b.m; it._seen = seen(ctx, b.front, true);
    ctx.score += b.s;
    // Papierhalter und Bürste daneben
    [['papier', .36], ['buerste', -.36]].forEach(([v, dx]) => {
      let t = b.t + dx; if (t < .1 || t > b.m.len - .1) t = b.t - dx; if (t < .1 || t > b.m.len - .1) return;
      addItem(ctx, { type: 'ac', v, ...hostOf(b.m), t: R2(t), y: v === 'papier' ? .75 : .3 });
    });
    return it;
  }
  function placeWT(ctx, wish) {
    const had = ctx.items.find(i => i.type === 'wt'); if (had) return had;
    const vars = wish.doppel ? ['w140', 'w120'] : wish.small ? ['w80', 'w60', 'h45'] : ['w100', 'w80', 'w60'];
    const b = bestPlace(ctx, 'wt', vars, { side: wish.small ? .05 : .1, front: wish.small ? .6 : .7 }, (c, v, w) => {
      let s = 0; const sv = seen(ctx, c.front, false);
      if (sv.vis) s -= sv.facing ? 1.2 : .7; // schöner erster Blick
      if (windowHit(ctx, c.m, c.t - w / 2, c.t + w / 2)) s += 1.6; // Spiegel nicht möglich
      s += .3 * plumbing(ctx, c.center);
      s -= { w140: .6, w120: .4, w100: .5, w80: .35, w60: 0, auf2: .6 }[v];
      // möglichst mittig auf der freien Wandfläche
      const free = freeSpan(ctx, c.m, c.t); if (free) { const mid = (free[0] + free[1]) / 2; s += .7 * Math.min(1, Math.abs(c.t - mid) / Math.max(.4, (free[1] - free[0]) / 2)); }
      return s;
    });
    if (!b) return null;
    const it = addItem(ctx, { type: 'wt', v: b.v, ...hostOf(b.m), t: b.t, sch: 'schub', arm: 'stand' }, { solid: b.solid, clear: b.clear, name: 'Waschtisch' });
    it._wet = wetKey(b.m); it._wetP = b.center; it._m = b.m; it._seen = seen(ctx, b.front, false);
    ctx.score += b.s;
    if (!windowHit(ctx, b.m, b.t - b.w / 2, b.t + b.w / 2)) addItem(ctx, { type: 'sp', v: 'led', ...hostOf(b.m), t: b.t, w: R2(Math.min(b.w, 1.2)) });
    return it;
  }
  function freeSpan(ctx, m, t) { // freier Bereich auf dieser Fläche um t (zwischen Ecken und Bodenobjekten)
    let lo = 0, hi = m.len; const band = quadM(m, 0, m.len, .02, .3);
    [...ctx.solids, ...innerWalls(ctx)].forEach(o => { if (!overlap(band, o.poly)) return;
      const us = o.poly.map(p => (p[0] - m.A[0]) * m.d[0] + (p[1] - m.A[1]) * m.d[1]); const a = Math.min(...us), b = Math.max(...us);
      if (b <= t) lo = Math.max(lo, b); else if (a >= t) hi = Math.min(hi, a); });
    return [lo, hi];
  }
  function placeTub(ctx, m, t, v, off) {
    const [w, d] = DIM.wa[v], o = off || 0, solid = quadM(m, t - w / 2, t + w / 2, o, o + d), clear = quadM(m, t - w / 2 + .2, t + w / 2 - .2, o + d, o + d + .7);
    if (!insideAll(ctx, solid) || hitsAny(solid, ctx.solids) || hitsAny(solid, innerWalls(ctx)) || hitsAny(solid, ctx.clears)) return null;
    const door = doorOf(ctx); if (door && overlap(shrink(solid, .012), door.swing)) return null;
    if (!insideAll(ctx, clear) || hitsAny(clear, ctx.solids)) return null;
    const it = addItem(ctx, { type: 'wa', v, ...hostOf(m), t: R2(t), ...(o ? { off: R2(o) } : {}), arm: v === 'frei' ? 'stand' : 'wand' }, { solid, clear, name: 'Badewanne' });
    it._wet = v === 'frei' ? 'boden' : wetKey(m); it._wetP = P(m, t, o + d / 2);
    return it;
  }
  function placeExtras(ctx, wish) {
    const du = ctx.items.find(i => i.type === 'du'), wa = ctx.items.find(i => i.type === 'wa'), wt = ctx.items.find(i => i.type === 'wt');
    const near = du ? du._wetP : wa ? wa._wetP : null;
    // Handtuchheizkörper an eine Raumwand nahe Dusche/Wanne
    const hk = bestPlace(ctx, 'hk', ['hk'], { roomOnly: true, front: .3 }, c => near ? Math.hypot(c.center[0] - near[0], c.center[1] - near[1]) : 0);
    if (hk) addItem(ctx, { type: 'hk', v: 'hk', ...hostOf(hk.m), t: hk.t }, { solid: hk.solid, clear: hk.clear, name: 'Heizkörper' });
    if (wish.wm) { const b = bestPlace(ctx, 'mo', ['wm'], { roomOnly: true, front: .7 }, c => plumbing(ctx, c.center));
      if (b) { const it = addItem(ctx, { type: 'mo', v: 'wm', ...hostOf(b.m), t: b.t }, { solid: b.solid, clear: b.clear, name: 'Waschmaschine' }); it._wet = wetKey(b.m); } else ctx.notes.push('Für die Waschmaschine ist kein Platz mit 70 cm Bewegungsfläche.'); }
    if (wish.stauraum && wt) { const b = bestPlace(ctx, 'mo', ['hoch'], { roomOnly: false, front: .6 }, c => Math.hypot(c.center[0] - wt._wetP[0], c.center[1] - wt._wetP[1]) + (windowHit(ctx, c.m, c.t - .2, c.t + .2) ? 9 : 0));
      if (b) addItem(ctx, { type: 'mo', v: 'hoch', ...hostOf(b.m), t: b.t }, { solid: b.solid, clear: b.clear, name: 'Hochschrank' }); }
  }

  // ---------- Bewertung des ganzen Bades ----------
  function freeSquare(ctx, size) { // gibt es irgendwo eine freie Bewegungsfläche size × size?
    const xs = ctx.pts.map(p => p[0]), zs = ctx.pts.map(p => p[1]);
    const obs = [...ctx.solids, ...innerWalls(ctx)];
    for (let x = Math.min(...xs); x <= Math.max(...xs) - size; x += .1) for (let z = Math.min(...zs); z <= Math.max(...zs) - size; z += .1) {
      const q = [[x, z], [x + size, z], [x + size, z + size], [x, z + size]];
      if (insideAll(ctx, q) && !obs.some(o => overlap(shrink(q, .01), o.poly))) return true;
    }
    return false;
  }
  function passages(ctx, onlyNew) { // Durchgänge an freien Enden von Wänden im Raum
    const W = walls(ctx.pts), out = [];
    ctx.walls.filter(w => w.inner && (!onlyNew || w.it.ki)).forEach(w => {
      const it = w.it; let ends, seg;
      if (it.type === 'fw') { ends = [it.a, it.b]; seg = [it.a, it.b]; }
      else { const m = W[it.wall], L = dimsOf(it).d; const a = P(m, it.t, 0), b = P(m, it.t, L); ends = [b]; seg = [a, b]; }
      ends.forEach(p => {
        const toWall = Math.min(...W.map(x => segDist(p, x.A, x.B))); if (toWall < .08) return;
        let gap = toWall;
        ctx.solids.forEach(s => { const touching = Math.min(...s.poly.map(c => segDist(c, seg[0], seg[1]))) < .12; if (touching) return;
          const dd = G.pip(s.poly, p[0], p[1]) ? 0 : Math.min(...s.poly.map((a, i) => segDist(p, a, s.poly[(i + 1) % s.poly.length]))); gap = Math.min(gap, dd); });
        ctx.walls.forEach(o => { if (o === w || !o.inner) return; const dd = Math.min(...o.poly.map((a, i) => segDist(p, a, o.poly[(i + 1) % o.poly.length]))); gap = Math.min(gap, dd); });
        out.push(gap);
      });
    });
    return out;
  }
  function evaluate(ctx, wish) {
    const pros = [], cons = [...ctx.notes]; let s = ctx.score;
    const wc = ctx.items.find(i => i.type === 'wc'), wt = ctx.items.find(i => i.type === 'wt'), du = ctx.items.find(i => i.type === 'du'), wa = ctx.items.find(i => i.type === 'wa');
    if (wish.dusche && !du) return null; if (wish.wanne && !wa) return null; if (!wc || !wt) return null;
    const gaps = passages(ctx, true); if (gaps.some(g => g < .7)) return null;
    const minGap = gaps.length ? Math.min(...gaps) : null;
    if (minGap != null) { if (minGap < .8) s += 1; pros.push(`Durchgang an der Trennwand ${cm(minGap)} cm breit`); }
    const wet = new Set(ctx.items.filter(i => i._wet && i._wet !== 'boden').map(i => i._wet)); wet.delete('inner');
    s += .8 * Math.max(0, wet.size - 1);
    if (wet.size <= 2) pros.push(wet.size <= 1 ? 'Alle Wasseranschlüsse an einer Wand – kurze Leitungen' : 'Wasseranschlüsse an nur 2 Wänden gebündelt');
    else cons.push(`Wasseranschlüsse an ${wet.size} Wänden – aufwendigere Installation`);
    if (wc._seen && !wc._seen.vis) pros.push('WC ist von der Tür aus nicht zu sehen'); else if (wc._seen && wc._seen.facing) cons.push('Man schaut beim Öffnen der Tür direkt aufs WC');
    if (wt._seen && wt._seen.vis) pros.push('Beim Betreten fällt der Blick auf den Waschtisch');
    if (du) { const f = du._fit, sd = f.sides, n = k => sd[k].wall ? sd[k].name : 'offen';
      const a = du.w * du.d; if (a < 1.1) s += 1.2; else if (a >= 1.4) s -= .5;
      pros.push(`Dusche ${cm(du.w)} × ${cm(du.d)} cm, Armatur mittig an ${n(f.arm)}, Rinne an ${n(f.drain)}`); }
    const big = freeSquare(ctx, wish.barrierefrei ? 1.2 : wish.small ? .8 : 1.0);
    if (!big) { if (wish.barrierefrei) return null; s += 2.5; cons.push('Wenig freie Bewegungsfläche in der Mitte'); }
    else pros.push(`Freie Bewegungsfläche ${wish.barrierefrei ? '120 × 120' : wish.small ? 'mindestens 80 × 80' : 'mindestens 100 × 100'} cm`);
    const parts = ctx.items.filter(i => (i.type === 'fw' || i.type === 'tw') && i.ki).length;
    if (wish.guenstig) s += 1.5 * parts;
    if (wish.walkin && du && du.glas !== 'ohne' && du.glas !== 'klar') s += .5;
    return { score: s, pros, cons };
  }

  // ---------- Konzepte ----------
  const CONCEPTS = {
    ecke: { titel: 'Dusche in der Ecke', konzept: 'Klassisch', text: 'Alles an den Wänden: die Dusche passgenau in der Ecke, viel freie Fläche in der Mitte. Günstig und zeitlos.', trend: 'Bodengleiche Dusche mit befliesbarer Rinne – ruhiges, fugenarmes Bild.' },
    tl: { titel: 'T-Lösung mit Walk-in', konzept: 'T-Lösung', text: 'Eine Wand ragt in den Raum und bildet eine geschützte Duschnische. Davor bleibt alles offen, der Waschtisch kann direkt an die T-Wand.', trend: 'Walk-in ohne Glastür hinter einer gefliesten Wand – pflegeleicht und wohnlich.' },
    tp: { titel: 'Raumteiler mit Duschnische', konzept: 'Raumteiler', text: 'Eine Wand parallel zur Rückwand teilt eine Nasszone ab. Der Waschtisch sitzt vorne am Raumteiler, die Dusche verschwindet dahinter.', trend: 'Zonierung statt offener Fläche: Wasch- und Duschbereich klar getrennt.' },
    nz: { titel: 'Nasszone über die ganze Breite', konzept: 'Nasszone', text: 'Die Dusche nimmt die ganze Stirnseite ein – großzügig wie im Hotel, mit einer Glasscheibe als Spritzschutz.', trend: 'Großzügige Duschbereiche über die volle Raumbreite.' },
    wn: { titel: 'WC in der Nische', konzept: 'WC-Nische', text: 'Eine halbhohe Trennwand schirmt das WC ab – vom Eingang aus nicht im Blick, die Ablage oben nutzt man als Regal.', trend: 'Halbhohe Trennwände mit Ablage für mehr Privatsphäre.' },
    wf: { titel: 'Freistehende Wanne', konzept: 'Freistehende Wanne', text: 'Die freistehende Wanne wird zum Blickfang, die Dusche sitzt passgenau in einer Ecke.', trend: 'Freistehende Wanne als Mittelpunkt des Bades.' },
    we: { titel: 'Wanne und Dusche', konzept: 'Wanne + Dusche', text: 'Eingebaute Wanne an der Wand und eine separate bodengleiche Dusche – für Familien ideal.', trend: 'Separate Dusche plus Wanne mit gefliester Ablage.' },
  };
  function finish(ctx, wish) { // fehlende Hauptobjekte ergänzen und bewerten
    if (wish.wanne && !ctx.items.find(i => i.type === 'wa')) {
      let best = null; ctx.ms.filter(m => !m.inner).forEach(m => ['r170'].forEach(v => [DIM.wa[v][0] / 2 + .005, m.len - DIM.wa[v][0] / 2 - .005, m.len / 2].forEach(t => {
        const c = clone(ctx); if (!placeTub(c, m, t, v)) return; const r = finishRest(c, wish); if (r && (!best || r.e.score < best.e.score)) best = r; })));
      return best;
    }
    return finishRest(ctx, wish);
  }
  function finishRest(ctx, wish) {
    if (wish.dusche && !ctx.items.find(i => i.type === 'du')) {
      let best = null;
      ctx.ms.filter(m => !m.inner).forEach(m => [.45, m.len - .45].forEach(t => (wish.small ? [[.9, .9], [1.0, .9], [1.2, .9]] : [[1.2, .9], [1.4, 1]]).forEach(([w, d]) => {
        if (late() && best) return; const c = clone(ctx); if (!placeShower(c, m, t, { w, d, min: wish.small ? .8 : .9, small: wish.small })) return; const r = finishBasics(c, wish); if (r && (!best || r.e.score < best.e.score)) best = r; })));
      return best;
    }
    return finishBasics(ctx, wish);
  }
  function finishBasics(ctx, wish) {
    // Reihenfolge WC/Waschtisch beides probieren, das bessere nehmen
    let best = null;
    [0, 1].forEach(order => { const c = clone(ctx);
      const ok = order ? (placeWT(c, wish) && placeWC(c, wish)) : (placeWC(c, wish) && placeWT(c, wish)); if (!ok) return;
      placeExtras(c, wish); const e = evaluate(c, wish); if (e && (!best || e.score < best.e.score)) best = { ctx: c, e }; });
    return best;
  }
  // opt.exclude: Kennungen schon gezeigter Vorschläge – dann kommen die nächstbesten Varianten
  function generate(base, wishIn, opt = {}) {
    const wish = parseWish(wishIn || {}), ex = new Set(opt.exclude || []);
    deadline = Date.now() + (opt.budget || 6000);
    const userWalls = (base.items || []).filter(i => i.type === 'fw' && !i.ki).length;
    const tries = [
      [wish, base, ''],
      [{ ...wish, small: true }, base, 'kompakt geplant (kleinere Abstände)'],
    ];
    if (userWalls) tries.push([{ ...wish, small: true }, { ...base, items: base.items.filter(i => i.type !== 'fw') }, 'ohne deine selbst gezeichneten freien Wände']);
    tries.push([{ ...wish, small: true, wanne: false, wm: false, stauraum: false, doppel: false, barrierefrei: false }, { ...base, items: (base.items || []).filter(i => i.type !== 'fw') }, 'ohne Zusatzwünsche (Wanne, Waschmaschine …)']);
    let out = [], how = '';
    for (const [w, b, label] of tries) {
      deadline = Math.max(deadline, Date.now() + 2500);
      const r = run(b, w, ex); const seen2 = new Set(out.map(o => o.sig));
      r.forEach(o => { if (!seen2.has(o.sig)) { if (label) o.hinweise = [`Hinweis: ${label}`, ...o.hinweise].slice(0, 3); out.push(o); } });
      if (out.length >= 2) break; if (r.length && !how) how = label;
    }
    out = out.slice(0, 6);
    out.why = out.length ? '' : diagnose(base, wish);
    return out;
  }
  function diagnose(base, wish) {
    const W = walls(base.pts), xs = base.pts.map(p => p[0]), zs = base.pts.map(p => p[1]);
    const area = Math.abs(base.pts.reduce((s0, a, i) => { const b = base.pts[(i + 1) % base.pts.length]; return s0 + a[0] * b[1] - b[0] * a[1]; }, 0) / 2);
    const ctx = makeCtx({ pts: base.pts, items: (base.items || []).filter(i => i.type === 'tu' || i.type === 'fe') }); refresh(ctx);
    const w0 = { ...wish, small: true }, parts = [];
    const c1 = clone(ctx); if (!placeWC(c1, w0)) parts.push('kein Platz für ein WC mit 60 cm davor');
    const c2 = clone(ctx); if (!placeWT(c2, w0)) parts.push('kein Platz für einen Waschtisch mit 60 cm davor');
    let du = false; W.forEach(w => [.45, w.len - .45].forEach(t => { if (!du) { const c = clone(ctx); du = !!placeShower(c, w, t, { w: .9, d: .9, min: .8, small: true }); } }));
    if (!du) parts.push('keine Ecke für eine Dusche 90 × 90 cm mit Einstieg');
    return `Raum ca. ${cm(Math.max(...xs) - Math.min(...xs))} × ${cm(Math.max(...zs) - Math.min(...zs))} cm (${area.toFixed(1).replace('.', ',')} m²), ${W.length} Wände. ` +
      (parts.length ? 'Problem: ' + parts.join('; ') + '. Bitte Maße und Tür prüfen.' : 'WC, Waschtisch und Dusche passen einzeln, aber nicht zusammen – Tür oder Maße prüfen, oder Wünsche reduzieren.');
  }
  const sigOf = ctx => ctx.items.filter(i => ['wc', 'wt', 'wa', 'fw', 'tw', 'du'].includes(i.type)).map(i => i.type + (i.host || i.wall) + Math.round((i.t || 0) * 5) + (i.a ? i.a.join() + i.b.join() : '')).sort().join('|');
  function run(base, wish, ex) {
    const start = makeCtx({ pts: base.pts, items: (base.items || []).filter(i => i.type === 'tu' || i.type === 'fe' || (i.type === 'fw' && !i.ki)) });
    refresh(start);
    const W = walls(base.pts), results = {};
    const keep = (key, r) => { if (!r) return; r.sig = sigOf(r.ctx); if (ex && ex.has(r.sig)) return; const L0 = results[key] || (results[key] = []);
      if (L0.some(x => x.sig === r.sig)) return; L0.push(r); L0.sort((a, b) => a.e.score - b.e.score); if (L0.length > 4) L0.pop(); };
    const wantShower = wish.dusche;
    // Ecke / klassisch
    keep('ecke', finish(start, wish));
    W.forEach((w, i) => [0, 1].forEach(sd => {
      if (late()) return;
      const prev = W[(i - 1 + W.length) % W.length], next = W[(i + 1) % W.length], adj = sd ? next : prev;
      const cornerOk = Math.abs(w.d[0] * adj.d[0] + w.d[1] * adj.d[1]) < .1; // rechter Winkel
      if (!cornerOk) return;
      // T-Lösung: Wand senkrecht von Wand i in den Raum, Dusche zwischen Ecke und T-Wand
      if (wantShower) [1.0, 1.2, 1.4].forEach(x => [1.2, 1.4, 1.6].forEach(L => {
        const u = sd ? w.len - x - .06 : x + .06; if (u < .9 || u > w.len - .5) return;
        const c = clone(start); const a = P(w, u, 0), b = P(w, u, L);
        c.items.push({ id: c.nid++, type: 'fw', v: 'hoch', a: a.map(R2), b: b.map(R2), ki: true }); refresh(c);
        if (!placeShower(c, w, sd ? w.len - x / 2 : x / 2, { w: x, d: L })) return;
        keep('tl', finish(c, wish));
      }));
      // Raumteiler: Wand parallel zu Wand i, Dusche dahinter, Einstieg von der Seite
      if (wantShower) [1.0, 1.2].forEach(D => [1.2, 1.4, 1.6].forEach(x => {
        if (x > w.len - .8) return;
        const C = sd ? w.B : w.A, dir = sd ? [-w.d[0], -w.d[1]] : w.d;
        const a = [C[0] + w.n[0] * (D + .06), C[1] + w.n[1] * (D + .06)], b = [a[0] + dir[0] * x, a[1] + dir[1] * x];
        const c = clone(start); c.items.push({ id: c.nid++, type: 'fw', v: 'hoch', a: a.map(R2), b: b.map(R2), ki: true }); refresh(c);
        if (!placeShower(c, w, sd ? w.len - x / 2 : x / 2, { w: x, d: D })) return;
        keep('tp', finish(c, wish));
      }));
      // WC-Nische mit halbhoher Trennwand
      [.95, 1.05].forEach(x => [1.0, 1.2].forEach(L => {
        const u = sd ? w.len - x : x; if (u < .8 || u > w.len - .4) return;
        const c = clone(start); c.items.push({ id: c.nid++, type: 'tw', v: 'halb', wall: i, t: R2(u), d: L, ki: true }); refresh(c);
        const wcT = sd ? w.len - (x - .06) / 2 : (x - .06) / 2, m = c.ms[i], [ww, dd] = DIM.wc[wish.duschwc ? 'dusch' : 'wand'];
        const solid = quadM(m, wcT - ww / 2, wcT + ww / 2, 0, dd), clear = quadM(m, wcT - ww / 2 - .1, wcT + ww / 2 + .1, dd, dd + .7);
        if (!insideAll(c, clear) || hitsAny(solid, c.solids) || hitsAny(clear, c.solids)) return;
        const door = doorOf(c); if (door && overlap(shrink(solid, .012), door.swing)) return;
        const wc = addItem(c, { type: 'wc', v: wish.duschwc ? 'dusch' : 'wand', wall: i, t: R2(wcT) }, { solid, clear, name: 'WC' });
        wc._wet = 'w' + i; wc._wetP = P(m, wcT, dd / 2); wc._seen = seen(c, P(m, wcT, dd + .05), true);
        [['papier', .3], ['buerste', -.3]].forEach(([v, dx]) => { const t = wcT + (sd ? -dx : dx); if (t > .08 && t < w.len - .08) addItem(c, { type: 'ac', v, wall: i, t: R2(t), y: v === 'papier' ? .75 : .3 }); });
        const r = finish(c, wish); keep('wn', r);
      }));
      // Nasszone über die ganze Wand
      if (wantShower && w.len <= 2.4 && w.len >= 1.0 && sd === 0) [1.0, 1.2].forEach(D => {
        const c = clone(start); const du = placeShower(c, w, w.len / 2, { w: w.len, d: D, full: true }); if (!du || du.w < w.len - .1) return; keep('nz', finish(c, wish)); });
      // Wannen
      if (wish.wanne && sd === 0) {
        if (w.len >= 2.2) [.3, .5].forEach(off => { const c = clone(start); if (!placeTub(c, w, w.len / 2, 'frei', off)) return; keep('wf', finish(c, wish)); });
        if (w.len >= 1.72) [DIM.wa.r170[0] / 2 + .005, w.len - DIM.wa.r170[0] / 2 - .005].forEach(t => { const c = clone(start); if (!placeTub(c, w, w.len >= 1.72 && w.len <= 1.86 ? w.len / 2 : t, 'r170')) return; keep('we', finish(c, wish)); });
      }
    }));
    // Ergebnisse aufbereiten, das Beste zuerst
    // je Konzept die beste noch nicht gezeigte Variante; gleiche Anordnungen nur einmal
    const sigs = new Set(), core = r => r.ctx.items.filter(i => ['wc', 'wt', 'wa', 'fw', 'tw'].includes(i.type)).map(i => i.type + (i.host || i.wall) + Math.round((i.t || 0) * 5) + (i.a ? i.a.join() + i.b.join() : '')).sort().join('|');
    return Object.entries(results).map(([k, L0]) => ({ k, r: L0[0] })).filter(x => x.r).sort((a, b) => a.r.e.score - b.r.e.score).filter(({ r }) => {
      const c0 = core(r); if (sigs.has(c0)) return false; sigs.add(c0); return true; }).map(({ k, r }) => {
      const C = CONCEPTS[k], items = r.ctx.items.map(it => { const o = {}; Object.keys(it).forEach(x => { if (x[0] !== '_') o[x] = it[x]; }); return o; });
      return { sig: r.sig, name: C.titel + (wish.small ? ' (kompakt)' : ''), konzept: C.konzept, note: C.text, trend: C.trend, pros: r.e.pros.slice(0, 5), hinweise: r.e.cons.slice(0, 3), score: Math.round(r.e.score * 10) / 10, plan: { items, nid: r.ctx.nid } };
    });
  }
  function parseWish(w) {
    const c = new Set((w.chips || []).map(String)), txt = String(w.text || '').toLowerCase();
    const has = (k, re) => c.has(k) || (re && re.test(txt));
    const wanne = has('Badewanne', /wanne/) || has('Dusche und Wanne');
    return {
      wanne, dusche: !(c.has('Badewanne') && !c.has('Dusche und Wanne') && !c.has('Walk-in-Dusche')) || /dusche/.test(txt),
      walkin: has('Walk-in-Dusche', /walk/), wcHidden: has('WC nicht vom Eingang sichtbar', /wc.*(nicht|versteck)/), doppel: has('Doppelwaschtisch', /doppel/),
      duschwc: has('Dusch-WC', /dusch-?wc/), wm: has('Waschmaschine', /waschmaschine/), stauraum: has('Viel Stauraum', /stauraum|schrank/),
      barrierefrei: has('Barrierefrei', /barriere|rollstuhl|senior/), guenstig: has('Möglichst günstig', /günstig|budget/),
    };
  }
  const api = { generate, parseWish, CONCEPTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LAYOUT = api;
})(typeof window !== 'undefined' ? window : globalThis);
