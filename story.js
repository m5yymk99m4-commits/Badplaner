// Bildgeschichten – Instagram-Karussells aus KI-Bildern
// Claude schreibt die Geschichte (Figuren, Szenen, Sprechblasen, Beitragstext),
// die OpenAI-Bild-KI zeichnet zuerst ein Figurenblatt und dann jede Szene mit diesem Blatt als Vorlage,
// damit die Figuren auf allen Bildern gleich aussehen. Claude prüft jedes Bild (Texte, Figuren) und lässt es bei Fehlern neu zeichnen.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ai = require('./ai');
const { AiError } = ai;

const STYLES = {
  comic: { name: 'Comic warm', en: 'warm hand-drawn European comic illustration, clean confident ink outlines, soft painterly colouring, golden warm light, cosy detailed backgrounds, expressive but natural faces, light film grain' },
  aquarell: { name: 'Aquarell', en: 'soft watercolour storybook illustration, delicate pencil lines, gentle washes of colour, paper texture, warm and nostalgic' },
  anim: { name: '3D-Animationsfilm', en: 'polished 3D animated feature film look, soft global illumination, appealing stylised characters with large expressive eyes, rich colours, shallow depth of field' },
  skizze: { name: 'Bleistift', en: 'expressive graphite pencil drawing with light colour accents, sketchbook feel, cross-hatching, warm paper' },
  manga: { name: 'Manga', en: 'clean modern manga / anime illustration, crisp line art, cel shading, soft pastel background colours, emotional close-ups' },
};
const SIZE = '1024x1536'; // wird beim Herunterladen mittig auf 4:5 (Instagram) zugeschnitten
const IMG_TRIES = 3;

const SYSTEM = `Du schreibst kurze, berührende Bildgeschichten für Instagram-Karussells auf Deutsch – im Stil von Comic-Beiträgen, die viele Menschen teilen.
So funktioniert eine gute Geschichte:
- Alltagsmoment mit einem Gegenstand oder Ritual, an dem Erinnerungen hängen (z. B. ein alter Anzug, eine Tasse, ein Fahrrad, ein Rezept).
- Bild 1 macht sofort neugierig (kleiner Konflikt, eine Frage). In der Mitte Rückblenden („Damals.“) oder eine Person, die die Vorgeschichte kennt. Am Ende eine Wendung, die zu Tränen rührt oder warm lächeln lässt, und ein ruhiges Schlussbild.
- Pro Bild höchstens 2 Sprechblasen, jede höchstens 12 Wörter, natürliche Umgangssprache, korrekte Rechtschreibung mit ä, ö, ü, ß. Keine Erzähltexte außer kurzen Schildern wie „Damals.“ oder „20 Jahre später.“
- Höchstens 4 wiederkehrende Figuren. Keine echten Personen, keine Marken, keine Logos, nichts Anstößiges. Kinder nur in harmlosen Familienszenen.
- Jede Figur bekommt eine feste, sehr genaue Beschreibung auf Englisch (Alter, Gesicht, Haare, Statur, feste Kleidung mit Farben). Zeigt eine Rückblende eine Figur deutlich jünger oder älter, lege dafür eine EIGENE Figur an (z. B. „Papa (damals)“) mit passender Beschreibung.
- Die Bildbeschreibung jeder Szene ist auf Englisch, nennt Ort, Tageszeit, Licht, Kameraeinstellung (Totale, Halbnah, Nah), wer wo steht, Blickrichtung, Gestik und Gefühl. Nenne die Figuren genau mit ihrem Namen aus der Figurenliste. Abwechslung bei den Einstellungen, damit das Karussell lebendig wirkt.
- Der Beitragstext ist eine kurze Frage an die Leser, die zum Kommentieren einlädt, dazu 5–8 passende deutsche Hashtags.
Speichere das Ergebnis immer mit dem Werkzeug „geschichte“.`;

const TOOL = {
  name: 'geschichte', description: 'Die fertige Bildgeschichte speichern.',
  input_schema: { type: 'object', required: ['titel', 'figuren', 'szenen', 'beitragstext', 'hashtags'], properties: {
    titel: { type: 'string', description: 'Kurzer Arbeitstitel, z. B. „Der alte Anzug“' },
    figuren: { type: 'array', items: { type: 'object', required: ['name', 'aussehen', 'look_en'], properties: {
      name: { type: 'string', description: 'Kurzer eindeutiger Name, z. B. „Papa“, „Lena“, „Schneiderin“' },
      aussehen: { type: 'string', description: 'Kurze deutsche Beschreibung für die App' },
      look_en: { type: 'string', description: 'Sehr genaue englische Beschreibung für die Bild-KI: age, face, hair, build, fixed outfit with colours' } } } },
    szenen: { type: 'array', items: { type: 'object', required: ['inhalt', 'bild_en', 'blasen'], properties: {
      inhalt: { type: 'string', description: 'Ein deutscher Satz: was passiert' },
      ort: { type: 'string', description: 'Kurzer Ortsname, gleich geschrieben wenn derselbe Ort wieder vorkommt, z. B. „Schlafzimmer“, „Schneiderei“' },
      bild_en: { type: 'string', description: 'Englische Bildbeschreibung (ohne Sprechblasentexte)' },
      schild: { type: 'string', description: 'Optional: kurzes Schild oben links, z. B. „Damals.“. Sonst leer.' },
      blasen: { type: 'array', maxItems: 2, items: { type: 'object', required: ['sprecher', 'text'], properties: {
        sprecher: { type: 'string', description: 'Name aus der Figurenliste' }, text: { type: 'string' } } } } } } },
    beitragstext: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  } },
};

function register({ route, db, HttpError, readJson, needUser, str, aiConfig, DATA_DIR, getSetting, setSetting }) {
  db.exec(`
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  idea TEXT NOT NULL DEFAULT '',
  style TEXT NOT NULL DEFAULT 'comic',
  quality TEXT NOT NULL DEFAULT 'medium',
  plan_json TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS story_panels (
  id INTEGER PRIMARY KEY,
  story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  nr INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'offen',
  file TEXT,
  note TEXT NOT NULL DEFAULT '',
  hint TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 0,
  UNIQUE (story_id, nr)
);`);
  const DIR = path.join(DATA_DIR, 'stories');
  fs.mkdirSync(DIR, { recursive: true });
  // Nach einem Neustart abgebrochene Bilder wieder einreihen
  db.prepare(`UPDATE story_panels SET state = 'warten' WHERE state = 'laeuft'`).run();
  try { db.exec('ALTER TABLE stories ADD COLUMN auto INTEGER NOT NULL DEFAULT 0'); } catch { /* existiert schon */ }

  const getStory = id => { const s = db.prepare('SELECT * FROM stories WHERE id = ?').get(id); if (!s) throw new HttpError(404, 'Geschichte nicht gefunden'); return s; };
  const panels = id => db.prepare('SELECT id, nr, state, note, hint, version, file IS NOT NULL AS has_image FROM story_panels WHERE story_id = ? ORDER BY nr').all(id);
  const out = s => { const { plan_json, ...rest } = s; return { ...rest, plan: JSON.parse(plan_json || '{}'), panels: panels(s.id), running: running.has(s.id) }; };
  const touch = id => db.prepare(`UPDATE stories SET updated_at = datetime('now') WHERE id = ?`).run(id);
  const syncPanels = (id, plan) => { // für jede Szene (und Figurenblatt = 0) eine Zeile
    const n = (plan.szenen || []).length;
    const ins = db.prepare('INSERT OR IGNORE INTO story_panels (story_id, nr) VALUES (?, ?)');
    for (let i = 0; i <= n; i++) ins.run(id, i);
    db.prepare('SELECT file FROM story_panels WHERE story_id = ? AND nr > ?').all(id, n).forEach(r => r.file && fs.rm(path.join(DIR, r.file), () => {}));
    db.prepare('DELETE FROM story_panels WHERE story_id = ? AND nr > ?').run(id, n);
  };

  // ---------- Geschichte schreiben ----------
  async function write(cfg, { idee, anzahl, stil, vorher, wunsch, themen }) {
    if (!cfg.key) throw new AiError(400, 'Es ist noch kein KI-Schlüssel (Anthropic) hinterlegt. Ein Admin kann ihn unter „KI“ eintragen.');
    let text;
    if (vorher) {
      text = `Hier ist die bisherige Geschichte als JSON:\n${JSON.stringify(vorher)}\n\nÄnderungswunsch: ${wunsch || 'Mach sie insgesamt stärker.'}\n\nÜberarbeite die Geschichte entsprechend. Behalte alles, was nicht geändert werden soll, möglichst genau bei (vor allem die Figurenbeschreibungen). Anzahl der Bilder: ${anzahl}.`;
    } else {
      text = `Schreibe eine Bildgeschichte mit genau ${anzahl} Bildern.\nZeichenstil: ${STYLES[stil].name}.\n` +
        (idee ? `Idee bzw. Thema: ${idee}` : 'Thema: Denk dir selbst eine neue, berührende Geschichte aus (Familie, Freundschaft, Nachbarn, Großeltern, Haustiere, kleine Gesten im Alltag). Sie soll nicht der Geschichte vom alten Anzug gleichen.' + (themen ? `\nBevorzugte Themen: ${themen}` : ''));
      const alt = db.prepare('SELECT title FROM stories ORDER BY id DESC LIMIT 40').all().map(r => r.title);
      if (!idee && alt.length) text += `\nDiese Geschichten gibt es schon – nimm einen deutlich anderen Gegenstand, Ort und eine andere Wendung:\n- ${alt.join('\n- ')}`;
    }
    const msgs = [{ role: 'user', content: text }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await ai.request(cfg, { max_tokens: 16000, system: SYSTEM, tools: [TOOL], tool_choice: { type: 'auto' }, messages: msgs }, 240000);
      const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === TOOL.name);
      if (use && Array.isArray(use.input?.szenen) && use.input.szenen.length && Array.isArray(use.input.figuren)) return clean(use.input);
      msgs.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
      msgs.push({ role: 'user', content: 'Bitte speichere die Geschichte jetzt mit dem Werkzeug „geschichte“.' });
    }
    throw new AiError(502, 'Die KI hat keine gültige Geschichte geliefert. Bitte noch einmal versuchen.');
  }
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  function clean(g) {
    const figuren = (Array.isArray(g.figuren) ? g.figuren : []).slice(0, 8).map(f => ({ name: s(f?.name, 40) || 'Figur', aussehen: s(f?.aussehen, 400), look_en: s(f?.look_en, 1200) }));
    const szenen = (Array.isArray(g.szenen) ? g.szenen : []).slice(0, 20).map(z => ({
      inhalt: s(z?.inhalt, 400), ort: s(z?.ort, 60), bild_en: s(z?.bild_en, 2500), schild: s(z?.schild, 40),
      blasen: (Array.isArray(z?.blasen) ? z.blasen : []).slice(0, 3).map(b => ({ sprecher: s(b?.sprecher, 40), text: s(b?.text, 160) })).filter(b => b.text) }));
    const hashtags = (Array.isArray(g.hashtags) ? g.hashtags : []).map(h => s(String(h), 40).replace(/^#?/, '#').replace(/\s+/g, '')).filter(h => h.length > 1).slice(0, 15);
    return { titel: s(g.titel, 80) || 'Neue Geschichte', figuren, szenen, beitragstext: s(g.beitragstext, 2000), hashtags };
  }

  // ---------- Bilder ----------
  const cast = plan => (plan.figuren || []).map(f => `- ${f.name}: ${f.look_en || f.aussehen}`).join('\n');
  function sheetPrompt(plan, style, retry) {
    return `Character reference sheet for an illustrated story. Style: ${STYLES[style].en}.
Show each of these characters once, full body, standing side by side facing the viewer, evenly spaced, neutral friendly expression, plain light warm-grey background, even lighting:
${cast(plan)}
Every character must clearly match the description (age, hair, clothes and colours). No text, no labels, no names, no watermark.` + (retry?.length ? `\nA previous attempt was rejected: ${retry.join(' ')} Fix exactly these points.` : '');
  }
  function scenePrompt(plan, style, nr, hint, retry) {
    const z = plan.szenen[nr - 1], n = plan.szenen.length;
    const who = (plan.figuren || []).filter(f => (z.bild_en + ' ' + z.blasen.map(b => b.sprecher).join(' ')).includes(f.name));
    const bubbles = z.blasen.map((b, i) => `${i + 1}) spoken by ${b.sprecher}, tail pointing to ${b.sprecher}'s mouth: "${b.text}"`).join('\n');
    return `Picture ${nr} of ${n} of an illustrated story (Instagram carousel), portrait format. Style: ${STYLES[style].en}.
The FIRST input image is the character reference sheet: every character must look EXACTLY like there (same face, age, hair, build, clothes and colours).${nr > 1 ? ' Further input images are earlier pictures of the same story: keep the same rooms, furniture and props where the location is the same.' : ''}
Characters in this picture:
${(who.length ? who : plan.figuren || []).map(f => `- ${f.name}: ${f.look_en || f.aussehen}`).join('\n')}
Scene: ${z.bild_en}
${z.blasen.length ? `Speech bubbles: classic white comic speech bubbles with a thin black outline, large, clean, hand-lettered comic font in black, very legible. Exactly ${z.blasen.length} bubble(s), German text copied EXACTLY letter by letter (keep ä ö ü ß, punctuation and capitalisation):\n${bubbles}` : 'No speech bubbles in this picture.'}
${z.schild ? `Small cream-coloured caption box with black outline in the top-left corner with the text: "${z.schild}"` : ''}
Composition: keep all faces, speech bubbles and caption boxes inside the central area – the top 9 % and bottom 9 % of the image show only background, because the picture will be cropped to 4:5.
No other text anywhere, no names, no page numbers, no watermark, no signature, no logos.` +
      (hint ? `\nExtra wish from the author: ${hint}` : '') + (retry?.length ? `\nA PREVIOUS ATTEMPT WAS REJECTED: ${retry.join(' ')} Fix exactly these points this time.` : '');
  }

  // OpenAI verlangt bei neuen Bildern ein Modell: das neueste verfügbare gpt-image-Modell nehmen (ohne „mini“)
  let imgModel = null, imgModelAt = 0;
  async function defaultImageModel(cfg, base) {
    if (imgModel && Date.now() - imgModelAt < 864e5) return imgModel;
    let ids = [];
    try { const r = await fetch(base + '/v1/models', { headers: { authorization: 'Bearer ' + cfg.openaiKey }, signal: AbortSignal.timeout(20000) }); const d = await r.json().catch(() => ({})); ids = (d.data || []).map(m => m.id); } catch {}
    const ver = id => (id.match(/gpt-image-(\d+(?:\.\d+)?)/) || [])[1];
    const cand = ids.filter(id => /^gpt-image-\d/.test(id) && !/mini|nano/.test(id) && !/\d{4}-\d{2}-\d{2}$/.test(id)).sort((a, b) => Number(ver(b)) - Number(ver(a)));
    imgModel = cand[0] || 'gpt-image-1'; imgModelAt = Date.now();
    console.log('Bild-Modell für Geschichten: ' + imgModel);
    return imgModel;
  }
  async function openaiImage(cfg, prompt, refs, quality) {
    if (!cfg.openaiKey) throw new AiError(400, 'Für die Bilder fehlt noch der Schlüssel für die Bild-KI (OpenAI). Ein Admin kann ihn unter „KI“ eintragen.');
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
    const body = { prompt, size: SIZE, quality, output_format: 'jpeg', n: 1, model: cfg.imageModel || await defaultImageModel(cfg, base) };
    const edit = refs.length > 0;
    if (edit) { body.images = refs.map(buf => ({ image_url: 'data:image/jpeg;base64,' + buf.toString('base64') })); body.input_fidelity = 'high'; }
    const send = () => fetch(base + (edit ? '/v1/images/edits' : '/v1/images/generations'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + cfg.openaiKey }, body: JSON.stringify(body), signal: AbortSignal.timeout(300000) });
    let r, data;
    try {
      r = await send(); data = await r.json().catch(() => ({}));
      if (!r.ok && /input_fidelity/i.test(data?.error?.message || '')) { delete body.input_fidelity; r = await send(); data = await r.json().catch(() => ({})); }
      if (!r.ok && !cfg.imageModel && body.model !== 'gpt-image-1' && /model/i.test((data?.error?.code || '') + ' ' + (data?.error?.message || ''))) {
        console.warn(`Bild-Modell ${body.model} nicht nutzbar, nehme gpt-image-1: ${data?.error?.message || r.status}`);
        imgModel = body.model = 'gpt-image-1'; r = await send(); data = await r.json().catch(() => ({}));
      }
    } catch { throw new AiError(504, 'Die Bild-KI hat nicht rechtzeitig geantwortet.'); }
    if (!r.ok) {
      const msg = data?.error?.message || '', code = data?.error?.code || '';
      const orig = msg ? ` (OpenAI: ${msg})` : ` (Fehlercode ${r.status})`;
      if (r.status === 401) throw new AiError(502, 'Der Schlüssel für die Bild-KI ist ungültig. Bitte unter „KI“ prüfen.' + orig);
      if (code === 'insufficient_quota' || /quota|billing|credit/i.test(msg)) throw new AiError(402, 'Das Guthaben bei OpenAI reicht nicht. Bitte unter platform.openai.com → Billing aufladen.' + orig);
      if (code === 'moderation_blocked' || /safety|moderation/i.test(msg)) throw new AiError(422, 'Die Bild-KI hat diese Szene aus Sicherheitsgründen abgelehnt. Bitte die Szene etwas umschreiben.' + orig);
      if (/verif/i.test(msg)) throw new AiError(502, 'OpenAI verlangt eine Verifizierung deiner Organisation (platform.openai.com → Settings → Organization).' + orig);
      if (r.status === 429) throw new AiError(503, 'Die Bild-KI ist gerade ausgelastet.' + orig);
      throw new AiError(502, 'Die Bild-KI hat einen Fehler gemeldet.' + orig);
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new AiError(502, 'Die Bild-KI hat kein Bild geliefert.');
    return Buffer.from(b64, 'base64');
  }

  const CHECK = {
    name: 'pruefung', description: 'Ergebnis der Prüfung speichern.',
    input_schema: { type: 'object', required: ['passt', 'fehler', 'fixes'], properties: {
      passt: { type: 'boolean', description: 'true, wenn alle Punkte erfüllt sind' },
      fehler: { type: 'array', items: { type: 'string' }, description: 'Jeder Fehler als kurzer deutscher Satz. Leer, wenn alles passt.' },
      fixes: { type: 'array', items: { type: 'string' }, description: 'Dieselben Punkte als kurze englische Anweisung an die Bild-KI' } } },
  };
  async function check(cfg, plan, nr, img, sheet) {
    const z = nr ? plan.szenen[nr - 1] : null;
    const imgs = [];
    if (sheet) imgs.push({ type: 'text', text: 'Bild A – Figurenblatt (Vorlage):' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: sheet.toString('base64') } });
    imgs.push({ type: 'text', text: (sheet ? 'Bild B' : 'Bild') + ' – zu prüfen:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: img.toString('base64') } });
    const text = nr === 0
      ? `Prüfe das Figurenblatt. Soll: jede dieser Figuren genau einmal, gut erkennbar, passend zur Beschreibung (Alter, Haare, Kleidung, Farben), kein Text im Bild.\n${cast(plan)}\nKleine Stilabweichungen sind egal. Speichere mit „pruefung“.`
      : `Prüfe Bild B aus einer Bildgeschichte streng.
1. Sprechblasen: Es müssen genau ${z.blasen.length} sein, mit GENAU diesen Texten (jeder Buchstabe, Umlaute, Satzzeichen; Zeilenumbrüche sind egal):
${z.blasen.map(b => `- ${b.sprecher}: „${b.text}“`).join('\n') || '- keine'}
${z.schild ? `Dazu ein Schild mit „${z.schild}“.` : 'Kein Schild.'}
2. Jede Blase zeigt grob zum richtigen Sprecher.
3. Sonst kein Text im Bild (keine erfundenen Wörter, Namen, Wasserzeichen).
4. Die Figuren sehen aus wie auf dem Figurenblatt (Gesicht, Alter, Haare, Kleidung, Farben). Figurenliste:\n${cast(plan)}
5. Szene passt grob: ${z.inhalt || z.bild_en}
6. Keine Blase und kein Gesicht ist abgeschnitten oder liegt im obersten bzw. untersten Zehntel des Bildes.
Unwichtig: Hintergrunddetails, Licht, kleine Stilunterschiede. Speichere mit „pruefung“.`;
    const messages = [{ role: 'user', content: [...imgs, { type: 'text', text }] }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await ai.request(cfg, { max_tokens: 2000, tools: [CHECK], tool_choice: { type: 'auto' }, messages }, 120000, 'Die Prüfung hat zu lange gedauert.');
      const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === CHECK.name);
      if (use && typeof use.input?.passt === 'boolean') return { ok: use.input.passt && !(use.input.fehler || []).length, fehler: use.input.fehler || [], fixes: use.input.fixes || [] };
      messages.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
      messages.push({ role: 'user', content: 'Bitte speichere das Ergebnis jetzt mit dem Werkzeug „pruefung“.' });
    }
    return null;
  }

  const readImg = row => (row && row.file && fs.existsSync(path.join(DIR, row.file)) ? fs.readFileSync(path.join(DIR, row.file)) : null);
  async function makePanel(storyId, nr) {
    const st = getStory(storyId), plan = JSON.parse(st.plan_json), cfg = aiConfig();
    const row = db.prepare('SELECT * FROM story_panels WHERE story_id = ? AND nr = ?').get(storyId, nr);
    if (!row) return;
    db.prepare(`UPDATE story_panels SET state = 'laeuft', note = '' WHERE id = ?`).run(row.id);
    try {
      let refs = [];
      const sheet = nr ? readImg(db.prepare('SELECT file FROM story_panels WHERE story_id = ? AND nr = 0').get(storyId)) : null;
      if (nr) {
        if (!sheet) throw new AiError(409, 'Zuerst muss das Figurenblatt fertig sein.');
        refs.push(sheet);
        const z = plan.szenen[nr - 1];
        // frühere Bilder am selben Ort (höchstens 2) als Vorlage für Raum und Möbel
        const same = plan.szenen.map((q, i) => ({ q, nr: i + 1 })).filter(x => x.nr !== nr && z.ort && x.q.ort === z.ort);
        same.sort((a, b) => Math.abs(a.nr - nr) - Math.abs(b.nr - nr));
        for (const x of same) { if (refs.length >= 3) break; const img = readImg(db.prepare(`SELECT file FROM story_panels WHERE story_id = ? AND nr = ? AND state IN ('fertig','warnung')`).get(storyId, x.nr)); if (img) refs.push(img); }
      }
      let retry = [], last = null, fehler = [];
      for (let i = 0; i < IMG_TRIES; i++) {
        const prompt = nr ? scenePrompt(plan, st.style, nr, row.hint, retry) : sheetPrompt(plan, st.style, retry);
        const buf = await openaiImage(cfg, prompt, refs, st.quality === 'high' ? 'high' : 'medium');
        last = buf;
        if (!cfg.key) { fehler = []; break; }
        let res = null; try { res = await check(cfg, plan, nr, buf, sheet); } catch (e) { console.warn('Bildprüfung fehlgeschlagen:', e.message); }
        if (!res || res.ok) { fehler = []; break; }
        fehler = res.fehler; retry = res.fixes.length ? res.fixes : res.fehler;
        console.log(`Geschichte ${storyId} Bild ${nr} Versuch ${i + 1} abgelehnt: ${fehler.join(' | ')}`);
      }
      const file = `s${storyId}-${nr}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
      fs.writeFileSync(path.join(DIR, file), last);
      if (row.file) fs.rm(path.join(DIR, row.file), () => {});
      db.prepare(`UPDATE story_panels SET state = ?, file = ?, note = ?, version = version + 1 WHERE id = ?`)
        .run(fehler.length ? 'warnung' : 'fertig', file, fehler.length ? 'Nach ' + IMG_TRIES + ' Versuchen noch nicht ganz richtig: ' + fehler.slice(0, 3).join('; ') : '', row.id);
    } catch (e) {
      console.warn(`Geschichte ${storyId} Bild ${nr}:`, e.message);
      db.prepare(`UPDATE story_panels SET state = 'fehler', note = ? WHERE id = ?`).run(String(e.message || 'Fehler').slice(0, 600), row.id);
      if (e.status === 402 || (e.status === 502 && /Schlüssel/.test(e.message))) throw e; // ganzen Lauf stoppen
    }
    touch(storyId);
  }

  // Hintergrund-Lauf: Bilder werden auf dem Server erzeugt, auch wenn das Handy gesperrt ist
  const running = new Set();
  async function run(storyId) {
    if (running.has(storyId)) return;
    running.add(storyId);
    try {
      const next = () => db.prepare(`SELECT nr FROM story_panels WHERE story_id = ? AND state = 'warten' ORDER BY nr`).all(storyId).map(r => r.nr);
      if (next().includes(0)) await makePanel(storyId, 0);
      const sheetOk = () => ['fertig', 'warnung'].includes(db.prepare('SELECT state FROM story_panels WHERE story_id = ? AND nr = 0').get(storyId)?.state);
      if (!sheetOk()) { db.prepare(`UPDATE story_panels SET state = 'offen', note = 'Wartet auf das Figurenblatt.' WHERE story_id = ? AND state = 'warten'`).run(storyId); return; }
      // zwei Bilder gleichzeitig
      const worker = async () => { for (;;) { const q = next(); if (!q.length) return; await makePanel(storyId, q[0]); } };
      await Promise.all([worker(), worker()]);
    } catch (e) {
      db.prepare(`UPDATE story_panels SET state = 'offen', note = ? WHERE story_id = ? AND state = 'warten'`).run('Gestoppt: ' + String(e.message).slice(0, 300), storyId);
    } finally { running.delete(storyId); }
  }
  // beim Start liegengebliebene Läufe fortsetzen
  setTimeout(() => db.prepare(`SELECT DISTINCT story_id FROM story_panels WHERE state = 'warten'`).all().forEach(r => run(r.story_id)), 5000).unref();

  // ---------- Routen ----------
  let writing = 0;
  const opts = b => ({
    stil: STYLES[b.stil] ? b.stil : 'comic',
    anzahl: Math.min(Math.max(Math.round(Number(b.anzahl) || 10), 4), 15),
    qualitaet: b.qualitaet === 'high' ? 'high' : 'medium',
  });
  async function aiWrite(args) {
    if (writing >= 3) throw new HttpError(429, 'Es werden gerade schon mehrere Geschichten geschrieben. Bitte kurz warten.');
    writing++;
    try { return await write(aiConfig(), args); } catch (e) { throw new HttpError(e.status || 500, e.message || 'KI-Fehler'); } finally { writing--; }
  }

  route('GET', '/api/stories', (req, res, u) => {
    needUser(u);
    return db.prepare(`SELECT s.id, s.title, s.style, s.updated_at, s.auto,
        (SELECT COUNT(*) FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0) AS total,
        (SELECT COUNT(*) FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0 AND p.state IN ('fertig','warnung')) AS done,
        (SELECT p.id FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0 AND p.file IS NOT NULL ORDER BY p.nr LIMIT 1) AS thumb,
        (SELECT p.version FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0 AND p.file IS NOT NULL ORDER BY p.nr LIMIT 1) AS thumb_v
      FROM stories s ORDER BY s.updated_at DESC`).all().map(r => ({ ...r, running: running.has(r.id) }));
  });
  route('GET', '/api/stories/styles', (req, res, u) => { needUser(u); return Object.entries(STYLES).map(([id, v]) => ({ id, name: v.name })); });
  route('POST', '/api/stories', async (req, res, u) => {
    needUser(u);
    const b = await readJson(req), o = opts(b), idee = str(b.idee, 3000);
    const plan = await aiWrite({ idee, anzahl: o.anzahl, stil: o.stil });
    const id = Number(db.prepare('INSERT INTO stories (title, idea, style, quality, plan_json, created_by) VALUES (?, ?, ?, ?, ?, ?)')
      .run(plan.titel, idee, o.stil, o.qualitaet, JSON.stringify(plan), u.id).lastInsertRowid);
    syncPanels(id, plan);
    return out(getStory(id));
  });
  route('GET', '/api/stories/:id', (req, res, u, p) => { needUser(u); return out(getStory(Number(p.id))); });
  route('PUT', '/api/stories/:id', async (req, res, u, p) => {
    needUser(u);
    const st = getStory(Number(p.id)), b = await readJson(req);
    if (running.has(st.id) && b.plan) throw new HttpError(409, 'Während Bilder entstehen, kann die Geschichte nicht geändert werden.');
    const plan = b.plan && typeof b.plan === 'object' ? clean(b.plan) : JSON.parse(st.plan_json);
    const style = STYLES[b.stil] ? b.stil : st.style, quality = ['medium', 'high'].includes(b.qualitaet) ? b.qualitaet : st.quality;
    db.prepare(`UPDATE stories SET title = ?, style = ?, quality = ?, plan_json = ?, updated_at = datetime('now') WHERE id = ?`).run(plan.titel, style, quality, JSON.stringify(plan), st.id);
    syncPanels(st.id, plan);
    return out(getStory(st.id));
  });
  route('POST', '/api/stories/:id/rewrite', async (req, res, u, p) => {
    needUser(u);
    const st = getStory(Number(p.id)), b = await readJson(req);
    if (running.has(st.id)) throw new HttpError(409, 'Bitte warten, bis die Bilder fertig sind.');
    const old = JSON.parse(st.plan_json);
    const anzahl = Math.min(Math.max(Math.round(Number(b.anzahl) || old.szenen.length), 4), 15);
    const plan = await aiWrite({ vorher: old, wunsch: str(b.wunsch, 2000), anzahl, stil: st.style });
    db.prepare(`UPDATE stories SET title = ?, plan_json = ?, updated_at = datetime('now') WHERE id = ?`).run(plan.titel, JSON.stringify(plan), st.id);
    syncPanels(st.id, plan);
    return out(getStory(st.id));
  });
  route('POST', '/api/stories/:id/render', async (req, res, u, p) => {
    needUser(u);
    const st = getStory(Number(p.id)), b = await readJson(req);
    const cfg = aiConfig();
    if (!cfg.openaiKey) throw new HttpError(400, 'Für die Bilder fehlt noch der Schlüssel für die Bild-KI (OpenAI). Ein Admin kann ihn unter „KI“ eintragen.');
    const all = panels(st.id);
    let nrs = Array.isArray(b.nrs) ? b.nrs.map(Number).filter(n => all.some(x => x.nr === n)) : all.filter(x => !x.has_image || x.state === 'fehler').map(x => x.nr);
    const sheet = all.find(x => x.nr === 0);
    if (nrs.length && !nrs.includes(0) && !(sheet && sheet.has_image)) nrs.unshift(0);
    const hint = typeof b.hinweis === 'string' ? b.hinweis.trim().slice(0, 600) : null;
    const upd = db.prepare(`UPDATE story_panels SET state = 'warten', note = ''${hint !== null ? ', hint = ?' : ''} WHERE story_id = ? AND nr = ? AND state <> 'laeuft'`);
    nrs.forEach(n => (hint !== null ? upd.run(hint, st.id, n) : upd.run(st.id, n)));
    touch(st.id);
    run(st.id);
    return out(getStory(st.id));
  });
  route('POST', '/api/stories/:id/stop', (req, res, u, p) => {
    needUser(u);
    const st = getStory(Number(p.id));
    db.prepare(`UPDATE story_panels SET state = 'offen', note = 'Angehalten.' WHERE story_id = ? AND state = 'warten'`).run(st.id);
    return out(getStory(st.id));
  });
  route('DELETE', '/api/stories/:id', (req, res, u, p) => {
    needUser(u);
    const st = getStory(Number(p.id));
    db.prepare('SELECT file FROM story_panels WHERE story_id = ?').all(st.id).forEach(r => r.file && fs.rm(path.join(DIR, r.file), () => {}));
    db.prepare('DELETE FROM stories WHERE id = ?').run(st.id);
    return { ok: true };
  });
  route('GET', '/api/story-images/:id', (req, res, u, p) => {
    needUser(u);
    const row = db.prepare('SELECT file FROM story_panels WHERE id = ?').get(Number(p.id));
    const f = row && row.file && path.join(DIR, path.basename(row.file));
    if (!f || !fs.existsSync(f)) throw new HttpError(404, 'Bild nicht gefunden');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
    fs.createReadStream(f).pipe(res);
  });

  // ---------- Automatik: jeden Tag neue Geschichten ----------
  const TZ = 'Europe/Berlin';
  const AUTO_DEF = { an: true, proTag: 2, zeiten: ['07:00', '15:00'], stil: 'comic', anzahl: 10, qualitaet: 'medium', themen: '', maxBilder: 40 };
  const autoCfg = () => { let c = {}; try { c = JSON.parse(getSetting('story_auto', '{}')); } catch {} return { ...AUTO_DEF, ...c }; };
  const autoState = () => { try { return JSON.parse(getSetting('story_auto_state', '{}')); } catch { return {}; } };
  const saveState = st => setSetting('story_auto_state', JSON.stringify(st));
  const berlin = (d = new Date()) => { const f = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d); return { day: f.slice(0, 10), hm: f.slice(11, 16) }; };
  const imagesToday = () => { const st = autoState(); return st.day === berlin().day ? st.bilder || 0 : 0; };
  let autoBusy = false;
  async function autoCreate(slotKey) {
    const c = autoCfg(), cfgAi = aiConfig();
    if (!cfgAi.key || !cfgAi.openaiKey) throw new Error('KI-Schlüssel fehlen (Anthropic und OpenAI unter „KI“).');
    if (imagesToday() + c.anzahl + 1 > c.maxBilder) throw new Error(`Tageslimit von ${c.maxBilder} Bildern erreicht.`);
    const plan = await write(cfgAi, { idee: '', anzahl: c.anzahl, stil: c.stil, themen: c.themen });
    const id = Number(db.prepare('INSERT INTO stories (title, idea, style, quality, plan_json, auto) VALUES (?, ?, ?, ?, ?, 1)')
      .run(plan.titel, 'Automatisch erstellt', c.stil, c.qualitaet, JSON.stringify(plan)).lastInsertRowid);
    syncPanels(id, plan);
    db.prepare(`UPDATE story_panels SET state = 'warten' WHERE story_id = ?`).run(id);
    const st = autoState(), today = berlin().day;
    if (st.day !== today) { st.day = today; st.bilder = 0; }
    st.bilder = (st.bilder || 0) + plan.szenen.length + 1;
    if (slotKey) st.done = [...(st.done || []).filter(k => k.slice(0, 10) >= today), slotKey];
    st.letzte = { id, titel: plan.titel, at: new Date().toISOString() }; st.fehler = '';
    saveState(st);
    console.log(`Automatisch neue Geschichte: ${plan.titel} (#${id})`);
    run(id);
    return id;
  }
  async function autoTick() {
    if (autoBusy) return;
    const c = autoCfg(); if (!c.an) return;
    const now = berlin(), st = autoState();
    const slots = c.zeiten.slice(0, c.proTag);
    for (let i = 0; i < slots.length; i++) {
      const key = `${now.day}#${i}`;
      if (now.hm < slots[i] || (st.done || []).includes(key)) continue;
      // nicht nachholen, wenn der Zeitpunkt schon über 3 Stunden vorbei ist (z. B. nach Server-Ausfall)
      const [h, m] = slots[i].split(':').map(Number), [nh, nm] = now.hm.split(':').map(Number);
      if ((nh * 60 + nm) - (h * 60 + m) > 180) { st.done = [...(st.done || []), key]; saveState(st); continue; }
      const tries = (st.versuche?.[key] || 0);
      if (tries >= 3) continue;
      autoBusy = true;
      try { await autoCreate(key); }
      catch (e) {
        const s2 = autoState(); s2.versuche = { ...(s2.versuche || {}), [key]: tries + 1 }; s2.fehler = `${new Date().toLocaleString('de-DE', { timeZone: TZ })}: ${e.message}`;
        if (tries + 1 >= 3) s2.done = [...(s2.done || []), key];
        saveState(s2); console.warn('Automatische Geschichte fehlgeschlagen:', e.message);
      } finally { autoBusy = false; }
      return; // höchstens eine pro Durchlauf
    }
  }
  setTimeout(() => autoTick().catch(() => {}), 20000).unref();
  setInterval(() => autoTick().catch(() => {}), 5 * 60000).unref();

  route('GET', '/api/stories/auto', (req, res, u) => {
    needUser(u);
    const c = autoCfg(), st = autoState(), now = berlin();
    const slots = c.zeiten.slice(0, c.proTag);
    const next = slots.find((t, i) => t > now.hm && !(st.done || []).includes(`${now.day}#${i}`));
    return { ...c, letzte: st.letzte || null, fehler: st.fehler || '', bilderHeute: imagesToday(), naechste: next ? `heute ${next} Uhr` : slots.length ? `morgen ${slots[0]} Uhr` : '' };
  });
  route('PUT', '/api/stories/auto', async (req, res, u) => {
    needUser(u);
    const b = await readJson(req), c = autoCfg();
    const times = Array.isArray(b.zeiten) ? b.zeiten.map(String).filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)).sort() : c.zeiten;
    const next = {
      an: typeof b.an === 'boolean' ? b.an : c.an,
      proTag: Math.min(Math.max(Math.round(Number(b.proTag) || c.proTag), 1), 4),
      zeiten: times.length ? times.slice(0, 4) : c.zeiten,
      stil: STYLES[b.stil] ? b.stil : c.stil,
      anzahl: Math.min(Math.max(Math.round(Number(b.anzahl) || c.anzahl), 4), 15),
      qualitaet: ['medium', 'high'].includes(b.qualitaet) ? b.qualitaet : c.qualitaet,
      themen: typeof b.themen === 'string' ? b.themen.trim().slice(0, 1000) : c.themen,
      maxBilder: Math.min(Math.max(Math.round(Number(b.maxBilder) || c.maxBilder), 5), 200),
    };
    while (next.zeiten.length < next.proTag) next.zeiten.push(['07:00', '15:00', '11:00', '19:00'].find(t => !next.zeiten.includes(t)));
    next.zeiten.sort();
    setSetting('story_auto', JSON.stringify(next));
    return next;
  });
  route('POST', '/api/stories/auto/now', async (req, res, u) => {
    needUser(u);
    if (autoBusy) throw new HttpError(429, 'Es wird gerade schon eine Geschichte geschrieben.');
    autoBusy = true;
    try { return { id: await autoCreate(null) }; } catch (e) { throw new HttpError(e.status || 400, e.message); } finally { autoBusy = false; }
  });

  return { STYLES, scenePrompt, sheetPrompt, clean };
}

module.exports = { register, STYLES };
