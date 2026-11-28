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

const SYSTEM = `Du bist Autor und Storyboarder für kurze, berührende Bildgeschichten auf Instagram (Karussell-Beiträge auf Deutsch, Comic-Stil mit Sprechblasen).
Deine Geschichten werden nur über Bilder und Sprechblasen erzählt. Jemand, der die Bilder nacheinander durchwischt, muss ohne jede Erklärung verstehen, was passiert, warum es passiert und warum das Ende berührt.

ARBEITSWEISE – erst denken, dann schreiben:
1. Kern: Eine Figur, ein Gegenstand oder Ritual, ein Geheimnis bzw. eine Bedeutung, die erst am Ende klar wird. Schreibe den Kern in einem Satz und die Wendung in einem Satz.
2. Zeitleiste: Lege fest, wann jede Szene spielt und wie alt jede Figur dann ist. Rechne nach (Beispiel: Tochter heute 28 → bei ihrer Taufe ist der Vater 28 Jahre jünger). Eine Figur kann nicht an zwei Orten gleichzeitig sein. Wer etwas erzählt, muss es wissen können.
3. Aufbau in dieser Reihenfolge:
   - Bild 1: Haken – ein kleiner Konflikt oder eine Frage im Alltag, sofort verständlich.
   - Bild 2–3: Der Konflikt wird deutlicher, der Gegenstand ist gut sichtbar.
   - Mitte: Jemand, der die Vorgeschichte kennt, erzählt sie, ODER Rückblenden mit Schild („Damals.“, „1998.“). Jede Rückblende zeigt genau einen wichtigen Moment, chronologisch geordnet.
   - Vorletzte Bilder: Die Hauptfigur versteht – Gefühl auf dem Gesicht, ein kurzer Satz.
   - Letztes Bild: Auflösung als ruhiges, starkes Schlussbild, das den Bogen zu Bild 1 schließt (gleicher Gegenstand, anderer Blick darauf).
4. Jede Szene folgt logisch aus der vorherigen: Ort, Tageszeit, Kleidung und wer anwesend ist, ändern sich nur, wenn es einen sichtbaren Grund gibt (neuer Ort, Schild für einen Zeitsprung). Gespräche gehen nahtlos weiter.

REGELN FÜR JEDES BILD:
- Ein klarer Moment pro Bild, zeichenbar: keine Gedanken, keine Gefühle ohne sichtbares Zeichen, keine Rückblende in der Rückblende, kein Text auf Gegenständen.
- Höchstens 2 Sprechblasen, jede höchstens 12 Wörter, natürliche Umgangssprache, perfekte Rechtschreibung mit ä, ö, ü, ß. Wer spricht, ist im Bild zu sehen. Keine Erzähltexte, nur kurze Schilder für Zeitsprünge.
- Höchstens 4 Hauptfiguren. Keine echten Personen, keine Marken, keine Logos, nichts Anstößiges.
- „figuren“ der Szene nennt genau die Figuren, die im Bild zu sehen sind – mit den Namen aus der Figurenliste.
- Figuren: Eine feste, sehr genaue englische Beschreibung (Alter, Gesicht, Haare, Statur, Kleidung mit Farben). Zeigt eine Rückblende eine Figur deutlich jünger, lege eine EIGENE Figur an (z. B. „Papa (damals)“) – mit demselben Gesicht, nur jünger, und erwähne das in der Beschreibung. Zieht eine Figur in einer Szene etwas anderes an (z. B. Brautkleid), steht das ausdrücklich in der Bildbeschreibung.
- Requisiten: Der zentrale Gegenstand bekommt eine eigene genaue englische Beschreibung (Farbe, Material, Gebrauchsspuren) und sieht in allen Bildern gleich aus – in Rückblenden ggf. neuer, das steht dann in der Bildbeschreibung.
- Bildbeschreibung (englisch): Ort, Tageszeit, Licht, Kameraeinstellung (wide / medium / close-up), wer wo steht (links/rechts), Blickrichtung, Gestik, Gesichtsausdruck, was der Gegenstand gerade tut. Abwechslung bei den Einstellungen, Nahaufnahmen für Gefühle.
- Beitragstext: eine kurze, warme Frage an die Leser, die zum Kommentieren einlädt, dazu 5–8 deutsche Hashtags.

VORBILD (so gut soll es sein): „Der alte Anzug“ – 1: Tochter: „Für die Hochzeit brauchst du aber einen schöneren Anzug, Papa.“ Papa: „Der hier geht doch noch.“ 2–3: Sie zeigt auf die abgewetzten Ärmel, er gibt nach. 4: Beim Schneider: „Herr Berger! Wieder der Anzug?“ – „Diesmal wohl zum letzten Mal.“ 5: Tochter erstaunt: „Sie kennen den?“ – „Den hab ich öfter gesehen als manche Verwandte.“ 6: „Zuerst war er für Ihre Taufe hier.“ 7: Rückblende „Damals.“: junger Papa im selben Anzug mit Baby vor der Kirche. 8–9: Einschulung, Abiturfeier – immer derselbe Anzug. 10–11: „Warum hast du dir nie einen neuen gekauft?“ – „Der war doch für die wichtigen Tage. Und an den wichtigsten warst immer du dabei.“ 12–13: „Dann ziehst du den bitte auch zu meiner Hochzeit an.“ – „Mit den alten Ärmeln?“ – „Ja. In dem bist du immer gekommen.“ 14: Hochzeit: „Bereit, meine Kleine?“ – „Jetzt schon, Papa.“
Erfinde aber immer eine EIGENE, neue Geschichte.

Speichere das Ergebnis mit dem Werkzeug „geschichte“.`;

const TOOL = {
  name: 'geschichte', description: 'Die fertige Bildgeschichte speichern.',
  input_schema: { type: 'object', required: ['titel', 'kern', 'wendung', 'figuren', 'szenen', 'beitragstext', 'hashtags'], properties: {
    titel: { type: 'string', description: 'Kurzer Arbeitstitel, z. B. „Der alte Anzug“' },
    kern: { type: 'string', description: 'Worum es geht, in einem Satz' },
    wendung: { type: 'string', description: 'Die Auflösung am Ende, in einem Satz' },
    figuren: { type: 'array', items: { type: 'object', required: ['name', 'aussehen', 'look_en'], properties: {
      name: { type: 'string', description: 'Kurzer eindeutiger Name, z. B. „Papa“, „Lena“, „Papa (damals)“' },
      aussehen: { type: 'string', description: 'Kurze deutsche Beschreibung für die App' },
      look_en: { type: 'string', description: 'Sehr genaue englische Beschreibung: age, face, hair, build, fixed outfit with colours' } } } },
    requisiten: { type: 'array', items: { type: 'object', required: ['name', 'look_en'], properties: {
      name: { type: 'string', description: 'z. B. „Anzug“' }, look_en: { type: 'string', description: 'Genaue englische Beschreibung' } } } },
    szenen: { type: 'array', items: { type: 'object', required: ['inhalt', 'zeit', 'ort', 'figuren', 'bild_en', 'blasen'], properties: {
      inhalt: { type: 'string', description: 'Ein deutscher Satz: was in diesem Bild passiert' },
      zeit: { type: 'string', description: 'Zeitebene, gleich geschrieben für gleiche Zeit, z. B. „heute“, „1998 Taufe“, „2004 Einschulung“' },
      ort: { type: 'string', description: 'Kurzer Ortsname, gleich geschrieben wenn derselbe Ort wieder vorkommt' },
      figuren: { type: 'array', items: { type: 'string' }, description: 'Namen der Figuren, die im Bild zu sehen sind' },
      requisiten: { type: 'array', items: { type: 'string' }, description: 'Namen der Requisiten, die im Bild zu sehen sind' },
      bild_en: { type: 'string', description: 'Englische Bildbeschreibung (ohne Sprechblasentexte)' },
      schild: { type: 'string', description: 'Optional: kurzes Schild oben links für Zeitsprünge, z. B. „Damals.“. Sonst leer.' },
      blasen: { type: 'array', maxItems: 2, items: { type: 'object', required: ['sprecher', 'text'], properties: {
        sprecher: { type: 'string', description: 'Name aus der Figurenliste, muss im Bild sein' }, text: { type: 'string' } } } } } } },
    beitragstext: { type: 'string' },
    hashtags: { type: 'array', items: { type: 'string' } },
  } },
};

const LEKTOR = `Du bist ein strenger Lektor für Instagram-Bildgeschichten (Comic-Karussells). Du bekommst eine geplante Geschichte als JSON.
Prüfe gründlich und ehrlich:
1. Verständlichkeit: Versteht man die Geschichte NUR aus Bildern + Sprechblasen, Bild für Bild, ohne Erklärung?
2. Reihenfolge und Logik: Folgt jedes Bild logisch aus dem vorherigen? Stimmen Zeitleiste und Alter? Ist jede Figur dort, wo sie sein kann? Weiß jede Figur, was sie sagt? Sind Zeitsprünge mit Schild markiert und chronologisch?
3. Kontinuität: Gleiche Orte, gleiche Kleidung, gleicher Gegenstand – Änderungen nur mit Grund und ausdrücklich beschrieben. Sprecher sind in „figuren“ der Szene enthalten. Alle Namen passen zur Figurenliste.
4. Spannungsbogen: Starker Haken in Bild 1, Wendung wird vorbereitet (der Gegenstand ist früh sichtbar), Ende berührt und schließt den Bogen zu Bild 1. Keine überflüssigen oder doppelten Bilder.
5. Zeichenbarkeit: Jedes Bild zeigt einen klaren Moment. Die englischen Beschreibungen sind genau genug (Positionen, Ausdruck, Einstellung).
6. Sprache: Natürlich, kurz (höchstens 12 Wörter pro Blase), fehlerfrei.
Gib eine Note von 1 bis 10. „passt“ nur bei Note 9 oder 10 und ohne echte Probleme. Speichere mit dem Werkzeug „lektorat“.`;
const LEKTOR_TOOL = {
  name: 'lektorat', description: 'Ergebnis des Lektorats speichern.',
  input_schema: { type: 'object', required: ['note', 'passt', 'probleme'], properties: {
    note: { type: 'integer', minimum: 1, maximum: 10 },
    passt: { type: 'boolean' },
    probleme: { type: 'array', items: { type: 'string' }, description: 'Konkrete Probleme mit Bildnummer und Verbesserungsvorschlag' } } },
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
  for (const col of ['auto INTEGER NOT NULL DEFAULT 0', "phase TEXT NOT NULL DEFAULT ''", "phase_note TEXT NOT NULL DEFAULT ''", "review TEXT NOT NULL DEFAULT ''", 'anzahl INTEGER NOT NULL DEFAULT 10']) {
    try { db.exec('ALTER TABLE stories ADD COLUMN ' + col); } catch { /* existiert schon */ }
  }

  const getStory = id => { const s = db.prepare('SELECT * FROM stories WHERE id = ?').get(id); if (!s) throw new HttpError(404, 'Geschichte nicht gefunden'); return s; };
  const panels = id => db.prepare('SELECT id, nr, state, note, hint, version, file IS NOT NULL AS has_image FROM story_panels WHERE story_id = ? ORDER BY nr').all(id);
  const out = s => { const { plan_json, review, ...rest } = s; let rv = null; try { rv = review ? JSON.parse(review) : null; } catch {} return { ...rest, review: rv, plan: JSON.parse(plan_json || '{}'), panels: panels(s.id), running: running.has(s.id) }; };
  const touch = id => db.prepare(`UPDATE stories SET updated_at = datetime('now') WHERE id = ?`).run(id);
  const syncPanels = (id, plan) => { // für jede Szene (und Figurenblatt = 0) eine Zeile
    const n = (plan.szenen || []).length;
    const ins = db.prepare('INSERT OR IGNORE INTO story_panels (story_id, nr) VALUES (?, ?)');
    for (let i = 0; i <= n; i++) ins.run(id, i);
    db.prepare('SELECT file FROM story_panels WHERE story_id = ? AND nr > ?').all(id, n).forEach(r => r.file && fs.rm(path.join(DIR, r.file), () => {}));
    db.prepare('DELETE FROM story_panels WHERE story_id = ? AND nr > ?').run(id, n);
  };

  // ---------- Geschichte schreiben: Entwurf → Lektorat → Überarbeitung ----------
  async function askTool(cfg, system, messages, tool, think) {
    const msgs = [...messages];
    for (let attempt = 0; attempt < 3; attempt++) {
      const body = { max_tokens: 32000, system, tools: [tool], tool_choice: { type: 'auto' }, messages: msgs };
      if (think && thinkingOk) body.thinking = { type: 'enabled', budget_tokens: 10000 };
      let data;
      try { data = await ai.request(cfg, body, 300000); }
      catch (e) { if (body.thinking && /thinking/i.test(e.message)) { thinkingOk = false; continue; } throw e; }
      const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === tool.name);
      if (use) return { use, content: data.content };
      msgs.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
      msgs.push({ role: 'user', content: `Bitte speichere das Ergebnis jetzt mit dem Werkzeug „${tool.name}“.` });
    }
    throw new AiError(502, 'Die KI hat kein gültiges Ergebnis geliefert. Bitte noch einmal versuchen.');
  }
  let thinkingOk = true;
  const validStory = g => g && Array.isArray(g.szenen) && g.szenen.length >= 3 && Array.isArray(g.figuren) && g.figuren.length;
  async function lektorat(cfg, plan) {
    try {
      const { use } = await askTool(cfg, LEKTOR, [{ role: 'user', content: 'Geschichte:\n' + JSON.stringify(plan, null, 1) }], LEKTOR_TOOL, true);
      return { note: Number(use.input.note) || 0, passt: !!use.input.passt, probleme: (use.input.probleme || []).map(String).slice(0, 15) };
    } catch (e) { console.warn('Lektorat fehlgeschlagen:', e.message); return null; }
  }
  async function write(cfg, { idee, anzahl, stil, vorher, wunsch, themen }) {
    if (!cfg.key) throw new AiError(400, 'Es ist noch kein KI-Schlüssel (Anthropic) hinterlegt. Ein Admin kann ihn unter „KI“ eintragen.');
    let text;
    if (vorher) {
      text = `Hier ist die bisherige Geschichte als JSON:\n${JSON.stringify(vorher)}\n\nÄnderungswunsch: ${wunsch || 'Mach sie insgesamt stärker, logischer und berührender.'}\n\nÜberarbeite die Geschichte entsprechend. Behalte alles, was nicht geändert werden soll, möglichst genau bei (vor allem die Figurenbeschreibungen). Genau ${anzahl} Bilder.`;
    } else {
      text = `Schreibe eine Bildgeschichte mit genau ${anzahl} Bildern.\nZeichenstil: ${STYLES[stil].name}.\n` +
        (idee ? `Idee bzw. Thema: ${idee}` : 'Thema: Denk dir selbst eine neue, berührende Geschichte aus (Familie, Freundschaft, Nachbarn, Großeltern, Haustiere, kleine Gesten im Alltag). Sie soll nicht der Geschichte vom alten Anzug gleichen.' + (themen ? `\nBevorzugte Themen: ${themen}` : ''));
      const alt = db.prepare("SELECT title FROM stories WHERE title <> 'Neue Geschichte' ORDER BY id DESC LIMIT 40").all().map(r => r.title);
      if (!idee && alt.length) text += `\nDiese Geschichten gibt es schon – nimm einen deutlich anderen Gegenstand, Ort und eine andere Wendung:\n- ${alt.join('\n- ')}`;
    }
    const msgs = [{ role: 'user', content: text }];
    let { use, content } = await askTool(cfg, SYSTEM, msgs, TOOL, true);
    if (!validStory(use.input)) throw new AiError(502, 'Die KI hat keine gültige Geschichte geliefert. Bitte noch einmal versuchen.');
    let best = { plan: clean(use.input), note: 0 };
    for (let round = 0; round < 2; round++) {
      const lk = await lektorat(cfg, best.plan);
      if (!lk) break;
      best.lektorat = lk;
      console.log(`Lektorat „${best.plan.titel}“ Runde ${round + 1}: Note ${lk.note}${lk.probleme.length ? ' – ' + lk.probleme.length + ' Probleme' : ''}`);
      if (lk.passt && lk.note >= 9) break;
      msgs.push({ role: 'assistant', content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: use.id, content:
        `Ein Lektor hat die Geschichte geprüft (Note ${lk.note}/10). Probleme:\n- ${lk.probleme.join('\n- ')}\n\nÜberarbeite die Geschichte so, dass alle Probleme gelöst sind. Weiterhin genau ${best.plan.szenen.length} Bilder. Speichere die komplette neue Fassung mit „geschichte“.` }] });
      try {
        ({ use, content } = await askTool(cfg, SYSTEM, msgs, TOOL, true));
        if (validStory(use.input)) best = { plan: clean(use.input), note: lk.note, lektorat: lk };
      } catch (e) { console.warn('Überarbeitung fehlgeschlagen:', e.message); break; }
    }
    return best.plan;
  }
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  function clean(g) {
    const arr = v => (Array.isArray(v) ? v : []);
    const figuren = arr(g.figuren).slice(0, 8).map(f => ({ name: s(f?.name, 40) || 'Figur', aussehen: s(f?.aussehen, 400), look_en: s(f?.look_en, 1200) }));
    const requisiten = arr(g.requisiten).slice(0, 4).map(r => ({ name: s(r?.name, 40), look_en: s(r?.look_en, 800) })).filter(r => r.name);
    const szenen = arr(g.szenen).slice(0, 20).map(z => ({
      inhalt: s(z?.inhalt, 400), zeit: s(z?.zeit, 60), ort: s(z?.ort, 60), bild_en: s(z?.bild_en, 2500), schild: s(z?.schild, 40),
      figuren: arr(z?.figuren).map(x => s(String(x), 40)).filter(Boolean).slice(0, 6),
      requisiten: arr(z?.requisiten).map(x => s(String(x), 40)).filter(Boolean).slice(0, 4),
      blasen: arr(z?.blasen).slice(0, 3).map(b => ({ sprecher: s(b?.sprecher, 40), text: s(b?.text, 160) })).filter(b => b.text) }));
    const hashtags = arr(g.hashtags).map(h => s(String(h), 40).replace(/^#?/, '#').replace(/\s+/g, '')).filter(h => h.length > 1).slice(0, 15);
    return { titel: s(g.titel, 80) || 'Neue Geschichte', kern: s(g.kern, 400), wendung: s(g.wendung, 400), figuren, requisiten, szenen, beitragstext: s(g.beitragstext, 2000), hashtags };
  }

  // ---------- Bilder ----------
  const cast = plan => (plan.figuren || []).map(f => `- ${f.name}: ${f.look_en || f.aussehen}`).join('\n');
  const props = plan => (plan.requisiten || []).map(r => `- ${r.name}: ${r.look_en}`).join('\n');
  const inScene = (plan, z) => {
    const names = new Set([...(z.figuren || []), ...z.blasen.map(b => b.sprecher)]);
    let who = (plan.figuren || []).filter(f => names.has(f.name));
    if (!who.length) who = (plan.figuren || []).filter(f => (z.bild_en + ' ' + z.blasen.map(b => b.sprecher).join(' ')).includes(f.name));
    const things = (plan.requisiten || []).filter(r => (z.requisiten || []).includes(r.name) || z.bild_en.toLowerCase().includes(r.name.toLowerCase()));
    return { who, things };
  };
  function sheetPrompt(plan, style, retry) {
    return `Character and prop reference sheet for an illustrated story. Style: ${STYLES[style].en}.
Show each of these characters exactly once, full body, standing side by side facing the viewer, evenly spaced, neutral friendly expression, plain light warm-grey background, even lighting. Characters that are younger versions of another character must clearly have the same face, only younger:
${cast(plan)}
${(plan.requisiten || []).length ? 'Below or beside them, show these important props clearly:\n' + props(plan) : ''}
Every character must clearly match the description (age, hair, clothes and colours). No text, no labels, no names, no watermark.` + (retry?.length ? `\nA previous attempt was rejected: ${retry.join(' ')} Fix exactly these points.` : '');
  }
  function scenePrompt(plan, style, nr, hint, retry, refInfo) {
    const z = plan.szenen[nr - 1], n = plan.szenen.length, prev = plan.szenen[nr - 2], { who, things } = inScene(plan, z);
    const bubbles = z.blasen.map((b, i) => `${i + 1}) spoken by ${b.sprecher}, tail pointing to ${b.sprecher}'s mouth: "${b.text}"`).join('\n');
    return `Picture ${nr} of ${n} of an illustrated story (Instagram carousel), portrait format. Style: ${STYLES[style].en}. Exactly the same drawing style, line weight and colour palette as the reference images.
Input images: ${refInfo.join('; ')}.
Every character must look EXACTLY like on the reference sheet (same face, age, hair, build, clothes and colours) unless the scene below says otherwise.
Story so far: ${plan.kern || ''}
${prev ? `Previous picture: ${prev.inhalt}` : 'This is the opening picture.'}
This picture (${z.zeit || 'present'}, ${z.ort || ''}): ${z.inhalt}
Characters visible – exactly these, nobody else in the foreground:
${who.map(f => `- ${f.name}: ${f.look_en || f.aussehen}`).join('\n') || '- none'}
${things.length ? 'Important props (must look exactly like this):\n' + things.map(r => `- ${r.name}: ${r.look_en}`).join('\n') : ''}
Scene: ${z.bild_en}
${z.blasen.length ? `Speech bubbles: classic white comic speech bubbles with a thin black outline, large, clean, hand-lettered comic font in black, very legible. Exactly ${z.blasen.length} bubble(s), German text copied EXACTLY letter by letter (keep ä ö ü ß, punctuation and capitalisation):\n${bubbles}` : 'No speech bubbles in this picture.'}
${z.schild ? `Small cream-coloured caption box with black outline in the top-left corner with the text: "${z.schild}"` : ''}
Composition: keep all faces, speech bubbles and caption boxes inside the central area – the top 9 % and bottom 9 % of the image show only background, because the picture will be cropped to 4:5.
No other text anywhere, no names, no page numbers, no watermark, no signature, no logos.` +
      (hint ? `\nExtra instruction: ${hint}` : '') + (retry?.length ? `\nA PREVIOUS ATTEMPT WAS REJECTED: ${retry.join(' ')} Fix exactly these points this time.` : '');
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
  const imgBlock = buf => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } });
  async function askCheck(cfg, content) {
    const messages = [{ role: 'user', content }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await ai.request(cfg, { max_tokens: 3000, tools: [CHECK], tool_choice: { type: 'auto' }, messages }, 150000, 'Die Prüfung hat zu lange gedauert.');
      const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === CHECK.name);
      if (use && typeof use.input?.passt === 'boolean') return { ok: use.input.passt && !(use.input.fehler || []).length, fehler: use.input.fehler || [], fixes: use.input.fixes || [] };
      messages.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
      messages.push({ role: 'user', content: 'Bitte speichere das Ergebnis jetzt mit dem Werkzeug „pruefung“.' });
    }
    return null;
  }
  async function check(cfg, plan, nr, img, sheet, prevImg) {
    if (nr === 0) return askCheck(cfg, [{ type: 'text', text: 'Figurenblatt:' }, imgBlock(img), { type: 'text', text:
      `Prüfe das Figurenblatt. Soll: jede dieser Figuren genau einmal, gut erkennbar, passend zur Beschreibung (Alter, Haare, Kleidung, Farben). Jüngere Versionen einer Figur haben erkennbar dasselbe Gesicht. Kein Text im Bild.\n${cast(plan)}\n${props(plan) ? 'Requisiten:\n' + props(plan) : ''}\nKleine Stilabweichungen sind egal. Speichere mit „pruefung“.` }]);
    const z = plan.szenen[nr - 1], prev = plan.szenen[nr - 2], { who, things } = inScene(plan, z);
    const content = [{ type: 'text', text: 'Bild A – Figurenblatt (Vorlage):' }, imgBlock(sheet)];
    if (prevImg) content.push({ type: 'text', text: `Bild V – das vorherige Bild der Geschichte (Bild ${nr - 1}):` }, imgBlock(prevImg));
    content.push({ type: 'text', text: `Bild B – das neue Bild ${nr}, zu prüfen:` }, imgBlock(img), { type: 'text', text:
`Prüfe Bild B aus einer Bildgeschichte streng. Geschichte: ${plan.kern || ''}
${prev ? `Vorheriges Bild: ${prev.inhalt} (${prev.zeit || ''}, ${prev.ort || ''})` : 'Es ist das erste Bild.'}
Dieses Bild soll zeigen: ${z.inhalt} (${z.zeit || ''}, ${z.ort || ''})
1. Sprechblasen: genau ${z.blasen.length}, mit GENAU diesen Texten (jeder Buchstabe, Umlaute, Satzzeichen; Zeilenumbrüche egal):
${z.blasen.map(b => `- ${b.sprecher}: „${b.text}“`).join('\n') || '- keine'}
${z.schild ? `Dazu ein Schild mit „${z.schild}“.` : 'Kein Schild.'} Sonst kein Text im Bild.
2. Jede Blase zeigt zum richtigen Sprecher, und der Sprecher ist im Bild.
3. Im Bild sind genau diese Figuren (Statisten im Hintergrund sind ok): ${who.map(f => f.name).join(', ') || 'keine'}. Sie sehen aus wie auf dem Figurenblatt (Gesicht, Alter, Haare, Kleidung, Farben).
${things.length ? '4. Der Gegenstand sieht so aus: ' + things.map(r => `${r.name}: ${r.look_en}`).join('; ') : '4. –'}
5. Das Bild zeigt klar, was passieren soll, und passt logisch an das vorherige Bild${prevImg ? ' (gleicher Ort und Kleidung, wenn Zeit und Ort gleich sind; gleicher Zeichenstil)' : ''}.
6. Keine Blase und kein Gesicht ist abgeschnitten oder liegt im obersten bzw. untersten Zehntel des Bildes.
Unwichtig: Hintergrunddetails, Licht. Speichere mit „pruefung“.` });
    return askCheck(cfg, content);
  }

  // Gesamtprüfung: Claude sieht alle Bilder in Reihenfolge und sucht Brüche
  const REVIEW_TOOL = {
    name: 'gesamtpruefung', description: 'Ergebnis der Gesamtprüfung speichern.',
    input_schema: { type: 'object', required: ['passt', 'probleme'], properties: {
      passt: { type: 'boolean' },
      probleme: { type: 'array', items: { type: 'object', required: ['bild', 'problem', 'fix_en'], properties: {
        bild: { type: 'integer', description: 'Nummer des Bildes, das neu gezeichnet werden soll' },
        problem: { type: 'string', description: 'Kurzer deutscher Satz' },
        fix_en: { type: 'string', description: 'Genaue englische Anweisung an die Bild-KI für das neue Bild' } } } } } },
  };
  async function reviewStory(cfg, storyId) {
    const plan = JSON.parse(getStory(storyId).plan_json);
    const rows = db.prepare('SELECT nr, file FROM story_panels WHERE story_id = ? AND nr > 0 ORDER BY nr').all(storyId);
    const content = [];
    for (const r of rows) { const b = readImg(r); if (!b) return null; const z = plan.szenen[r.nr - 1]; content.push({ type: 'text', text: `Bild ${r.nr} – soll zeigen: ${z.inhalt} (${z.zeit || ''}, ${z.ort || ''})` }, imgBlock(b)); }
    const sheet = readImg(db.prepare('SELECT file FROM story_panels WHERE story_id = ? AND nr = 0').get(storyId));
    if (sheet) content.unshift({ type: 'text', text: 'Figurenblatt (Vorlage):' }, imgBlock(sheet));
    content.push({ type: 'text', text: `Das ist eine komplette Bildgeschichte für ein Instagram-Karussell, in der richtigen Reihenfolge. Geschichte: ${plan.kern || ''} Wendung: ${plan.wendung || ''}
Prüfe sie als Ganzes, so wie ein Leser sie durchwischt:
- Versteht man die Geschichte nur aus den Bildern und Sprechblasen? Ergibt die Reihenfolge Sinn?
- Sehen dieselben Figuren auf allen Bildern gleich aus (Gesicht, Haare, Kleidung)? Jüngere Versionen erkennbar dieselbe Person?
- Sieht der zentrale Gegenstand überall gleich aus? Sind gleiche Orte gleich gezeichnet?
- Passt der Zeichenstil auf allen Bildern zusammen?
- Steht in den Sprechblasen genau der geplante Text, an der richtigen Figur?
Nenne NUR echte Brüche, die einem Leser auffallen würden, höchstens 4, jeweils mit dem Bild, das neu gezeichnet werden soll. Speichere mit „gesamtpruefung“.` });
    const messages = [{ role: 'user', content }];
    for (let attempt = 0; attempt < 2; attempt++) {
      const data = await ai.request(cfg, { max_tokens: 4000, tools: [REVIEW_TOOL], tool_choice: { type: 'auto' }, messages }, 240000, 'Die Gesamtprüfung hat zu lange gedauert.');
      const use = (data.content || []).find(c => c.type === 'tool_use' && c.name === REVIEW_TOOL.name);
      if (use && typeof use.input?.passt === 'boolean') {
        const probleme = (use.input.probleme || []).filter(p => Number(p.bild) >= 1 && Number(p.bild) <= rows.length).slice(0, 4).map(p => ({ bild: Number(p.bild), problem: String(p.problem || ''), fix_en: String(p.fix_en || '') }));
        return { passt: use.input.passt && !probleme.length, probleme };
      }
      messages.push({ role: 'assistant', content: data.content && data.content.length ? data.content : [{ type: 'text', text: '…' }] });
      messages.push({ role: 'user', content: 'Bitte speichere das Ergebnis jetzt mit dem Werkzeug „gesamtpruefung“.' });
    }
    return null;
  }

  const readImg = row => (row && row.file && fs.existsSync(path.join(DIR, row.file)) ? fs.readFileSync(path.join(DIR, row.file)) : null);
  const panelImg = (storyId, nr) => readImg(db.prepare(`SELECT file FROM story_panels WHERE story_id = ? AND nr = ? AND state IN ('fertig','warnung')`).get(storyId, nr));
  async function makePanel(storyId, nr, extraHint) {
    const st = getStory(storyId), plan = JSON.parse(st.plan_json), cfg = aiConfig();
    const row = db.prepare('SELECT * FROM story_panels WHERE story_id = ? AND nr = ?').get(storyId, nr);
    if (!row) return;
    db.prepare(`UPDATE story_panels SET state = 'laeuft', note = '' WHERE id = ?`).run(row.id);
    try {
      const refs = [], refInfo = [];
      const sheet = nr ? readImg(db.prepare('SELECT file FROM story_panels WHERE story_id = ? AND nr = 0').get(storyId)) : null;
      let prevImg = null;
      if (nr) {
        if (!sheet) throw new AiError(409, 'Zuerst muss das Figurenblatt fertig sein.');
        refs.push(sheet); refInfo.push(`image ${refs.length} = character reference sheet`);
        const z = plan.szenen[nr - 1], same = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
        // vorheriges Bild derselben Zeitebene: gleicher Stil, gleiche Kleidung, gleicher Raum
        const prev = plan.szenen[nr - 2];
        if (prev && same(prev.zeit, z.zeit)) { prevImg = panelImg(storyId, nr - 1); if (prevImg) { refs.push(prevImg); refInfo.push(`image ${refs.length} = the previous picture (${nr - 1}), same time – keep clothes, room and style consistent`); } }
        // weiteres Bild vom selben Ort und derselben Zeit
        const cands = plan.szenen.map((q, i) => ({ q, n: i + 1 })).filter(x => x.n !== nr && x.n !== nr - 1 && z.ort && same(x.q.ort, z.ort) && same(x.q.zeit, z.zeit)).sort((a, b) => Math.abs(a.n - nr) - Math.abs(b.n - nr));
        for (const x of cands) { const im = panelImg(storyId, x.n); if (im) { refs.push(im); refInfo.push(`image ${refs.length} = picture ${x.n} at the same place – keep room and furniture`); break; } }
        // kein direkter Vorgänger aus derselben Zeit (z. B. nach einer Rückblende): letztes Bild derselben Zeitebene, für Kleidung und Figuren
        if (!prevImg) { for (let k = nr - 2; k >= 1; k--) { if (!same(plan.szenen[k - 1].zeit, z.zeit) || refs.length >= 3) continue; if (refInfo.some(t => t.includes(`picture ${k} `))) break; const im = panelImg(storyId, k); if (im) { refs.push(im); refInfo.push(`image ${refs.length} = picture ${k}, same time period – keep clothes and faces consistent`); break; } } }
        // sonst Stil-Anker: Bild 1
        if (refs.length === 1 && nr > 1) { const im = panelImg(storyId, 1); if (im) { refs.push(im); refInfo.push(`image ${refs.length} = picture 1 of the story – use only for drawing style and colour palette, NOT for time, place or clothes`); } }
      }
      const hint = [row.hint, extraHint].filter(Boolean).join(' ');
      let retry = [], last = null, fehler = [];
      for (let i = 0; i < IMG_TRIES; i++) {
        const prompt = nr ? scenePrompt(plan, st.style, nr, hint, retry, refInfo) : sheetPrompt(plan, st.style, retry);
        const buf = await openaiImage(cfg, prompt, refs, st.quality === 'high' ? 'high' : 'medium');
        last = buf;
        if (!cfg.key) { fehler = []; break; }
        let res = null; try { res = await check(cfg, plan, nr, buf, sheet, prevImg); } catch (e) { console.warn('Bildprüfung fehlgeschlagen:', e.message); }
        if (!res || res.ok) { fehler = []; break; }
        fehler = res.fehler; retry = res.fixes.length ? res.fixes : res.fehler;
        console.log(`Geschichte ${storyId} Bild ${nr} Versuch ${i + 1} abgelehnt: ${fehler.join(' | ')}`);
      }
      const file = `s${storyId}-${nr}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
      fs.writeFileSync(path.join(DIR, file), last);
      if (row.file) fs.rm(path.join(DIR, row.file), () => {});
      db.prepare(`UPDATE story_panels SET state = ?, file = ?, note = ?, version = version + 1 WHERE id = ?`)
        .run(fehler.length ? 'warnung' : 'fertig', file, fehler.length ? 'Nach ' + IMG_TRIES + ' Versuchen noch nicht ganz richtig: ' + fehler.slice(0, 3).join('; ') : '', row.id);
      if (nr === 0) db.prepare(`UPDATE stories SET review = '' WHERE id = ?`).run(storyId);
    } catch (e) {
      console.warn(`Geschichte ${storyId} Bild ${nr}:`, e.message);
      db.prepare(`UPDATE story_panels SET state = 'fehler', note = ? WHERE id = ?`).run(String(e.message || 'Fehler').slice(0, 600), row.id);
      if (e.status === 402 || (e.status === 502 && /Schlüssel/.test(e.message))) throw e; // ganzen Lauf stoppen
    }
    touch(storyId);
  }

  // Hintergrund-Lauf: Bilder der Reihe nach (jedes Bild sieht das vorherige), danach Gesamtprüfung
  const running = new Set();
  async function run(storyId) {
    if (running.has(storyId)) return;
    running.add(storyId);
    const cfg = aiConfig();
    try {
      const next = () => db.prepare(`SELECT nr FROM story_panels WHERE story_id = ? AND state = 'warten' ORDER BY nr`).all(storyId).map(r => r.nr);
      if (next().includes(0)) await makePanel(storyId, 0);
      const sheetOk = () => ['fertig', 'warnung'].includes(db.prepare('SELECT state FROM story_panels WHERE story_id = ? AND nr = 0').get(storyId)?.state);
      if (!sheetOk()) { db.prepare(`UPDATE story_panels SET state = 'offen', note = 'Wartet auf das Figurenblatt.' WHERE story_id = ? AND state = 'warten'`).run(storyId); return; }
      let drew = false;
      for (;;) { const q = next(); if (!q.length) break; await makePanel(storyId, q[0]); drew = true; }
      const allDone = () => db.prepare(`SELECT COUNT(*) AS n FROM story_panels WHERE story_id = ? AND nr > 0 AND state NOT IN ('fertig','warnung')`).get(storyId).n === 0;
      if (drew && cfg.key && allDone()) {
        db.prepare(`UPDATE stories SET review = ? WHERE id = ?`).run(JSON.stringify({ laeuft: true }), storyId);
        let rv = null; try { rv = await reviewStory(cfg, storyId); } catch (e) { console.warn('Gesamtprüfung:', e.message); }
        if (rv && rv.probleme.length) {
          console.log(`Gesamtprüfung Geschichte ${storyId}: ${rv.probleme.map(p => p.bild + ': ' + p.problem).join(' | ')}`);
          for (const p of rv.probleme.sort((a, b) => a.bild - b.bild)) {
            if (!db.prepare('SELECT 1 FROM story_panels WHERE story_id = ? AND nr = ?').get(storyId, p.bild)) continue;
            db.prepare(`UPDATE story_panels SET state = 'warten' WHERE story_id = ? AND nr = ?`).run(storyId, p.bild);
            await makePanel(storyId, p.bild, p.fix_en);
          }
          let rv2 = null; try { rv2 = await reviewStory(cfg, storyId); } catch (e) { console.warn('Gesamtprüfung:', e.message); }
          rv = rv2 ? { ...rv2, korrigiert: rv.probleme.map(p => p.bild) } : { passt: false, probleme: [], korrigiert: rv.probleme.map(p => p.bild) };
        }
        db.prepare(`UPDATE stories SET review = ? WHERE id = ?`).run(rv ? JSON.stringify({ ...rv, at: new Date().toISOString() }) : '', storyId);
      }
    } catch (e) {
      db.prepare(`UPDATE story_panels SET state = 'offen', note = ? WHERE story_id = ? AND state = 'warten'`).run('Gestoppt: ' + String(e.message).slice(0, 300), storyId);
    } finally { running.delete(storyId); }
  }
  // beim Start liegengebliebene Läufe fortsetzen
  setTimeout(() => db.prepare(`SELECT DISTINCT story_id FROM story_panels WHERE state = 'warten'`).all().forEach(r => run(r.story_id)), 5000).unref();

  // Schreiben läuft ebenfalls im Hintergrund (Entwurf + Lektorat dauern einige Minuten)
  const writingNow = new Set();
  async function writeJob(id, args, thenRender) {
    writingNow.add(id);
    db.prepare(`UPDATE stories SET phase = 'schreibt', phase_note = '' WHERE id = ?`).run(id);
    try {
      const plan = await write(aiConfig(), args);
      db.prepare(`UPDATE stories SET title = ?, plan_json = ?, phase = '', phase_note = '', review = '', updated_at = datetime('now') WHERE id = ?`).run(plan.titel, JSON.stringify(plan), id);
      syncPanels(id, plan);
      if (thenRender) { db.prepare(`UPDATE story_panels SET state = 'warten', note = '' WHERE story_id = ?`).run(id); run(id); }
      return plan;
    } catch (e) {
      console.warn(`Geschichte ${id} schreiben:`, e.message);
      db.prepare(`UPDATE stories SET phase = 'fehler', phase_note = ? WHERE id = ?`).run(String(e.message || 'Fehler').slice(0, 600), id);
      throw e;
    } finally { writingNow.delete(id); }
  }
  // nach Neustart: abgebrochenes Schreiben als Fehler markieren
  db.prepare(`UPDATE stories SET phase = 'fehler', phase_note = 'Unterbrochen (Server-Neustart). Bitte noch einmal versuchen.' WHERE phase = 'schreibt'`).run();

  // ---------- Routen ----------
  const opts = b => ({
    stil: STYLES[b.stil] ? b.stil : 'comic',
    anzahl: Math.min(Math.max(Math.round(Number(b.anzahl) || 10), 4), 15),
    qualitaet: b.qualitaet === 'high' ? 'high' : 'medium',
  });
  const busyWriting = () => { if (writingNow.size >= 3) throw new HttpError(429, 'Es werden gerade schon mehrere Geschichten geschrieben. Bitte kurz warten.'); };

  route('GET', '/api/stories', (req, res, u) => {
    needUser(u);
    return db.prepare(`SELECT s.id, s.title, s.style, s.updated_at, s.auto, s.phase,
        (SELECT COUNT(*) FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0) AS total,
        (SELECT COUNT(*) FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0 AND p.state IN ('fertig','warnung')) AS done,
        (SELECT p.id FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0 AND p.file IS NOT NULL ORDER BY p.nr LIMIT 1) AS thumb,
        (SELECT p.version FROM story_panels p WHERE p.story_id = s.id AND p.nr > 0 AND p.file IS NOT NULL ORDER BY p.nr LIMIT 1) AS thumb_v
      FROM stories s ORDER BY s.updated_at DESC`).all().map(r => ({ ...r, running: running.has(r.id) }));
  });
  route('GET', '/api/stories/styles', (req, res, u) => { needUser(u); return Object.entries(STYLES).map(([id, v]) => ({ id, name: v.name })); });
  route('POST', '/api/stories', async (req, res, u) => {
    needUser(u); busyWriting();
    const b = await readJson(req), o = opts(b), idee = str(b.idee, 3000);
    if (!aiConfig().key) throw new HttpError(400, 'Es ist noch kein KI-Schlüssel (Anthropic) hinterlegt. Ein Admin kann ihn unter „KI“ eintragen.');
    const id = Number(db.prepare(`INSERT INTO stories (title, idea, style, quality, anzahl, created_by, phase) VALUES ('Neue Geschichte', ?, ?, ?, ?, ?, 'schreibt')`)
      .run(idee, o.stil, o.qualitaet, o.anzahl, u.id).lastInsertRowid);
    writeJob(id, { idee, anzahl: o.anzahl, stil: o.stil }, !!b.zeichnen).catch(() => {});
    return out(getStory(id));
  });
  route('POST', '/api/stories/:id/retry', (req, res, u, p) => {
    needUser(u); busyWriting();
    const st = getStory(Number(p.id));
    if (writingNow.has(st.id)) throw new HttpError(409, 'Die Geschichte wird gerade schon geschrieben.');
    writeJob(st.id, { idee: st.idea === 'Automatisch erstellt' ? '' : st.idea, anzahl: st.anzahl, stil: st.style, themen: st.auto ? autoCfg().themen : '' }, !!st.auto).catch(() => {});
    return out(getStory(st.id));
  });
  route('GET', '/api/stories/:id', (req, res, u, p) => { needUser(u); return out(getStory(Number(p.id))); });
  route('PUT', '/api/stories/:id', async (req, res, u, p) => {
    needUser(u);
    const st = getStory(Number(p.id)), b = await readJson(req);
    if ((running.has(st.id) || writingNow.has(st.id)) && b.plan) throw new HttpError(409, 'Während Bilder entstehen, kann die Geschichte nicht geändert werden.');
    const plan = b.plan && typeof b.plan === 'object' ? clean(b.plan) : JSON.parse(st.plan_json);
    const style = STYLES[b.stil] ? b.stil : st.style, quality = ['medium', 'high'].includes(b.qualitaet) ? b.qualitaet : st.quality;
    db.prepare(`UPDATE stories SET title = ?, style = ?, quality = ?, plan_json = ?, phase = '', phase_note = '', updated_at = datetime('now') WHERE id = ?`).run(plan.titel, style, quality, JSON.stringify(plan), st.id);
    syncPanels(st.id, plan);
    return out(getStory(st.id));
  });
  route('POST', '/api/stories/:id/rewrite', async (req, res, u, p) => {
    needUser(u); busyWriting();
    const st = getStory(Number(p.id)), b = await readJson(req);
    if (running.has(st.id) || writingNow.has(st.id)) throw new HttpError(409, 'Bitte warten, bis die Bilder fertig sind.');
    const old = JSON.parse(st.plan_json);
    if (!old.szenen) throw new HttpError(400, 'Es gibt noch keine Geschichte zum Überarbeiten.');
    const anzahl = Math.min(Math.max(Math.round(Number(b.anzahl) || old.szenen.length), 4), 15);
    writeJob(st.id, { vorher: old, wunsch: str(b.wunsch, 2000), anzahl, stil: st.style }, false).catch(() => {});
    return out(getStory(st.id));
  });
  route('POST', '/api/stories/:id/render', async (req, res, u, p) => {
    needUser(u);
    const st = getStory(Number(p.id)), b = await readJson(req);
    const cfg = aiConfig();
    if (st.phase === 'schreibt') throw new HttpError(409, 'Die Geschichte wird noch geschrieben.');
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
  async function autoCreate(slotKey, wait) {
    const c = autoCfg(), cfgAi = aiConfig();
    if (!cfgAi.key || !cfgAi.openaiKey) throw new Error('KI-Schlüssel fehlen (Anthropic und OpenAI unter „KI“).');
    if (imagesToday() + c.anzahl + 1 > c.maxBilder) throw new Error(`Tageslimit von ${c.maxBilder} Bildern erreicht.`);
    const id = Number(db.prepare(`INSERT INTO stories (title, idea, style, quality, anzahl, auto, phase) VALUES ('Neue Geschichte', 'Automatisch erstellt', ?, ?, ?, 1, 'schreibt')`)
      .run(c.stil, c.qualitaet, c.anzahl).lastInsertRowid);
    const st = autoState(), today = berlin().day;
    if (st.day !== today) { st.day = today; st.bilder = 0; }
    st.bilder = (st.bilder || 0) + c.anzahl + 1;
    if (slotKey) st.done = [...(st.done || []).filter(k => k.slice(0, 10) >= today), slotKey];
    st.letzte = { id, titel: 'Neue Geschichte', at: new Date().toISOString() }; st.fehler = '';
    saveState(st);
    const job = writeJob(id, { idee: '', anzahl: c.anzahl, stil: c.stil, themen: c.themen }, true).then(plan => {
      const s2 = autoState(); if (s2.letzte?.id === id) { s2.letzte.titel = plan.titel; saveState(s2); }
      console.log(`Automatisch neue Geschichte: ${plan.titel} (#${id})`);
    });
    if (wait) await job; else job.catch(() => {});
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
      try { await autoCreate(key, true); }
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
    try { return { id: await autoCreate(null, false) }; } catch (e) { throw new HttpError(e.status || 400, e.message); } finally { autoBusy = false; }
  });

  return { STYLES, scenePrompt, sheetPrompt, clean };
}

module.exports = { register, STYLES };
