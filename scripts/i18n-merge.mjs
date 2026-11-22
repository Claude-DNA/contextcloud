// Merge scripts/ru/*.tsv (index<TAB>translation) with src/i18n/keys.json → src/i18n/ru.json
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const keys = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/keys.json'), 'utf8'));
const dir = path.join(root, 'scripts/ru');
const out = {};
const problems = [];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.tsv')).sort()) {
  for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    const idx = Number(line.slice(0, tab));
    const ru = line.slice(tab + 1);
    const en = keys[idx];
    if (en === undefined) { problems.push(`${f}: bad index ${idx}`); continue; }
    const ph = s => (s.match(/\{[a-zA-Z0-9_]+\}/g) || []).sort();
    const extra = ph(ru).filter(p => !ph(en).includes(p));
    if (extra.length) problems.push(`${f}:${idx} unknown placeholder ${extra} in «${ru}» (en: ${en})`);
    out[en] = ru;
  }
}
// extra entries not extracted from source (feelings etc.)
const extraFile = path.join(dir, 'extra.json');
if (fs.existsSync(extraFile)) Object.assign(out, JSON.parse(fs.readFileSync(extraFile, 'utf8')));
fs.writeFileSync(path.join(root, 'src/i18n/ru.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`ru.json: ${Object.keys(out).length} entries of ${keys.length} keys`);
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; }
