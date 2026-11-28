/* Gemeinsame Geometrie für Planer (Browser) und KI (Server).
   fitShower: misst die Nische rund um eine Dusche aus und bestimmt Größe, Einstieg, Armatur- und Rinnenseite.
   Koordinaten der Montagefläche m: A (Startpunkt), d (Richtung entlang der Wand), n (in den Raum), len.
   Hindernisse: { poly:[[x,z]…] (konvex), wall:true|false, inner:true|false (Wand im Raum), name } */
(function (root) {
  const clipHalf = (poly, f) => { // behält Punkte mit f(p) >= 0
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  };
  // Bereich [min,max] der Koordinate k (0=u, 1=v) eines Polygons, eingeschränkt auf o0 <= andere Koordinate <= o1
  const range = (poly, k, o0, o1) => {
    const j = 1 - k; let p = clipHalf(poly, q => q[j] - o0); p = clipHalf(p, q => o1 - q[j]);
    if (p.length < 2) return null;
    const vs = p.map(q => q[k]); const lo = Math.min(...vs), hi = Math.max(...vs);
    return hi - lo < 1e-4 && p.length < 3 ? null : { lo, hi };
  };
  const SIDES = ['h', 'v', 'l', 'r'], OPP = { h: 'v', v: 'h', l: 'r', r: 'l' };

  function fitShower(m, t, obstacles, opt = {}) {
    const defW = opt.defW || 1.2, defD = opt.defD || 0.9, maxOpen = 2.0;
    const toL = p => { const x = p[0] - m.A[0], z = p[1] - m.A[1]; return [x * m.d[0] + z * m.d[1], x * m.n[0] + z * m.n[1]]; };
    const obs = obstacles.map(o => ({ ...o, lp: o.poly.map(toL) }));
    // 1) Was steht vor der Dusche (gegenüber der Montagewand)?
    let front = null, D = Infinity;
    obs.forEach(o => { if (!o.wall) return; const r = range(o.lp, 1, t - .25, t + .25); if (r && r.lo > .3 && r.lo < D) { D = r.lo; front = o; } });
    if (front && !front.inner && D > 1.25) { front = null; D = Infinity; } // gegenüberliegende Raumwand zählt nur bei schmalen Nischen
    let d = D <= maxOpen ? D : null;
    // 2) Seitliche Grenzen im Streifen vor der Wand
    const band = d || defD;
    let left = 0, right = m.len, lo = null, ro = null;
    obs.forEach(o => {
      if (o === front) return;
      const r = range(o.lp, 0, .03, band - .03); if (!r) return;
      if (r.hi <= t + .02) { if (r.hi > left) { left = r.hi; lo = o; } }
      else if (r.lo >= t - .02) { if (r.lo < right) { right = r.lo; ro = o; } }
    });
    left = Math.max(0, left); right = Math.min(m.len, right);
    // Nische hinter einer Wand im Raum (T-Lösung): Breite = so weit die Wand davor reicht
    if (front) { const fr = { lo: Math.min(...front.lp.map(q => q[0])), hi: Math.max(...front.lp.map(q => q[0])) };
      const a = Math.max(left, fr.lo), b = Math.min(right, fr.hi); if (b - a >= .7) { if (a > left) lo = null; if (b < right) ro = null; left = a; right = b; } }
    // Keine Wand davor: Tiefe aus seitlicher Trennwand (Nische zwischen Trennwand und Wand)
    if (d == null) {
      const ds = [lo, ro].filter(o => o && o.inner).map(o => Math.max(...o.lp.map(q => q[1]))).filter(x => x >= .8 && x <= maxOpen);
      d = ds.length ? Math.max(...ds) : defD;
    }
    let w = right - left, tt = (left + right) / 2;
    if (w > (opt.maxW || 1.8) && !(front && front.wall) && !opt.full) { // offene lange Wand: Standardbreite an die nähere Grenze
      w = Math.min(defW, w); const toL0 = t - left, toR0 = right - t;
      if (lo && (!ro || toL0 <= toR0)) { tt = left + w / 2; ro = null; } else if (ro) { tt = right - w / 2; lo = null; } else { tt = Math.min(Math.max(t, left + w / 2), right - w / 2); lo = ro = null; }
    }
    if (w < .7) return null;
    // Nichts darf in die fertige Fläche ragen: Tiefe ggf. verkürzen
    obs.forEach(o => { if (o === front || o === lo || o === ro) return; const r = range(o.lp, 1, tt - w / 2 + .03, tt + w / 2 - .03); if (r && r.lo > .3 && r.lo < d) d = r.lo; });
    if (opt.maxD) d = Math.min(d, opt.maxD);
    if (d < .7) return null;
    return { t: +tt.toFixed(3), w: +w.toFixed(3), d: +d.toFixed(3), ...classify(m, tt, w, d, obstacles, opt) };
  }

  // Welche Seite ist Wand, welche offen? Wo ist der Einstieg, wo Armatur und Rinne?
  function classify(m, t, w, d, obstacles, opt = {}) {
    const toL = p => { const x = p[0] - m.A[0], z = p[1] - m.A[1]; return [x * m.d[0] + z * m.d[1], x * m.n[0] + z * m.n[1]]; };
    const obs = obstacles.map(o => ({ ...o, lp: o.poly.map(toL) }));
    const u0 = t - w / 2, u1 = t + w / 2, E = .06;
    const sides = { h: { wall: true, inner: !!m.inner, name: m.label || m.name || 'Wand', len: w } };
    const sideWall = (k, test, cover, len) => {
      let best = null;
      obs.forEach(o => { if (!o.wall) return; const r = test(o); if (r && r.hi - r.lo >= cover && (!best || r.hi - r.lo > best.c)) best = { o, c: r.hi - r.lo }; });
      sides[k] = best ? { wall: true, inner: !!best.o.inner, name: best.o.name, len } : { wall: false, len };
    };
    sideWall('l', o => { const r = range(o.lp, 0, .05, d - .05); return r && r.hi >= u0 - E && r.hi <= u0 + E ? range(o.lp, 1, u0 - E, u0 + E) : null; }, .6 * d, d);
    sideWall('r', o => { const r = range(o.lp, 0, .05, d - .05); return r && r.lo >= u1 - E && r.lo <= u1 + E ? range(o.lp, 1, u1 - E, u1 + E) : null; }, .6 * d, d);
    sideWall('v', o => { const r = range(o.lp, 1, u0 + .05, u1 - .05); return r && r.lo >= d - E && r.lo <= d + E ? range(o.lp, 0, d - E, d + E) : null; }, .6 * w, w);
    // Einstieg: offene Seite mit dem meisten freien Raum davor
    const room = opt.room;
    const inside = p => !room || pip(room, p[0], p[1]);
    const P = (u, v) => [m.A[0] + m.d[0] * u + m.n[0] * v, m.A[1] + m.d[1] * u + m.n[1] * v];
    const free = k => { const mid = { v: [t, d], l: [u0, d / 2], r: [u1, d / 2] }[k], dir = { v: [0, 1], l: [-1, 0], r: [1, 0] }[k]; let s = 0;
      for (let x = .1; x <= 1.2; x += .1) { const q = P(mid[0] + dir[0] * x, mid[1] + dir[1] * x); if (!inside(q) || obstacles.some(o => pip(o.poly, q[0], q[1]))) break; s = x; } return s; };
    const open = ['v', 'r', 'l'].filter(k => !sides[k].wall);
    let entry = open.length ? open.map(k => ({ k, f: free(k) })).sort((a, b) => b.f - a.f)[0].k : 'v';
    let arm = sides[OPP[entry]] && sides[OPP[entry]].wall ? OPP[entry] : 'h';
    if (opt.arm && sides[opt.arm] && sides[opt.arm].wall) arm = opt.arm;
    let drain = SIDES.find(k => k !== arm && sides[k].wall && sides[k].inner) || arm;
    if (opt.drain && sides[opt.drain]) drain = opt.drain;
    return { sides, entry, arm, drain, autoArm: !opt.arm, autoDrain: !opt.drain };
  }
  function pip(poly, x, z) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  const quad = (A, d, n, u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [A[0] + d[0] * u + n[0] * v, A[1] + d[1] * u + n[1] * v]);
  const api = { fitShower, classify, quad, pip, SIDES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GEO = api;
})(typeof window !== 'undefined' ? window : globalThis);
