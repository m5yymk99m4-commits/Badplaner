// Notfall: Passwort eines Kontos neu setzen. Aufruf auf dem Server: badplaner-passwort
'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'badplaner.db'));
const hash = pw => { const salt = crypto.randomBytes(16); return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`; };
(async () => {
  const users = db.prepare('SELECT id, email, name FROM users ORDER BY id').all();
  if (!users.length) { console.log('Es gibt noch keine Konten.'); return; }
  console.log('\nVorhandene Konten:'); users.forEach(u => console.log(`  ${u.email}  (${u.name})`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const lines = [], waiters = [];
  rl.on('line', l => waiters.length ? waiters.shift()(l) : lines.push(l));
  rl.question = q => { process.stdout.write(q); return new Promise(r => lines.length ? r(lines.shift()) : waiters.push(r)); };
  const email = (await rl.question('\nE-Mail des Kontos: ')).trim();
  const u = users.find(x => x.email.toLowerCase() === email.toLowerCase());
  if (!u) { console.log('Kein Konto mit dieser E-Mail.'); rl.close(); process.exit(1); }
  const p1 = await rl.question('Neues Passwort (mind. 10 Zeichen): ');
  const p2 = await rl.question('Neues Passwort wiederholen: ');
  rl.close();
  if (p1 !== p2) { console.log('Die Passwörter sind nicht gleich. Nichts geändert.'); process.exit(1); }
  if (p1.length < 10) { console.log('Zu kurz. Nichts geändert.'); process.exit(1); }
  db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(hash(p1), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  console.log(`\nFertig. Neues Passwort für ${u.email} ist gesetzt.`);
})();
