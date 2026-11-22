// Wraps user-facing text in client components with tr("..."), for the Russian site.
// Usage: node scripts/i18n-codemod.mjs [--dry] file.tsx ...
// Handles: JSX text, string labels (placeholder, title, aria-label, alt, label), and string literals
// inside JSX expressions that are conditions or fallbacks ({busy ? 'Saving…' : 'Save'}).
// Leaves template literals, constants and messages set in handlers for manual work.
import fs from 'node:fs';
import ts from 'typescript';

const dry = process.argv.includes('--dry');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);
const ENTITIES = { apos: "'", quot: '"', amp: '&', lt: '<', gt: '>', nbsp: ' ', mdash: '—', ndash: '–', rarr: '→', larr: '←', hellip: '…', copy: '©', times: '×', middot: '·', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', minus: '−', check: '✓' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENTITIES[e] ?? m;
});
const wordy = (s) => /[A-Za-z]{2}/.test(s);
const looksLikeText = (s) => wordy(s) && (/\s/.test(s.trim()) || /^[A-Z]/.test(s.trim()) || /[.!?…:]$/.test(s.trim())) && !/^(https?:|\/|#|[a-z0-9_-]+\.[a-z]{2,}$)/i.test(s.trim()) && !/^[a-z0-9_-]+(\s[a-z0-9:_\/\[\]\.-]+)*$/.test(s.trim());

let total = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!/^['"]use client['"]/m.test(text.split('\n').slice(0, 3).join('\n'))) { console.log(`skip (server) ${file}`); continue; }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const inside = (node, tags) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isJsxElement(p) && tags.includes(p.openingElement.tagName.getText(sf))) return true;
    }
    return false;
  };
  const literalEdit = (lit) => {
    const v = lit.text;
    if (!looksLikeText(v)) return;
    edits.push([lit.getStart(sf), lit.end, `tr(${JSON.stringify(v)})`]);
  };
  const walkExpr = (e) => {
    if (!e) return;
    if (ts.isParenthesizedExpression(e)) return walkExpr(e.expression);
    if (ts.isConditionalExpression(e)) { walkExpr(e.whenTrue); walkExpr(e.whenFalse); return; }
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(e.operatorToken.kind)) {
      if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) walkExpr(e.left);
      walkExpr(e.right); return;
    }
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) literalEdit(e);
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const raw = text.slice(node.pos, node.end);
      if (wordy(raw) && !inside(node, ['style', 'script', 'code', 'pre', 'kbd'])) {
        const lines = raw.split(/\r?\n/);
        const parts = lines.map((l, i) => {
          let x = l.replace(/\t/g, ' ');
          if (i > 0) x = x.replace(/^\s+/, '');
          if (i < lines.length - 1) x = x.replace(/\s+$/, '');
          return x;
        }).filter((l) => l.length);
        const eff = parts.join(' ');
        const core = decode(eff.trim()).replace(/\s+/g, ' ');
        if (wordy(core)) {
          const lead = /^\s/.test(eff) ? '{" "}' : '';
          const trail = /\s$/.test(eff) ? '{" "}' : '';
          edits.push([node.pos, node.end, `${lead}{tr(${JSON.stringify(core)})}${trail}`]);
        }
      }
    } else if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(sf)) && node.initializer) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) {
        const v = decode(init.text);
        if (wordy(v)) edits.push([init.getStart(sf), init.end, `{tr(${JSON.stringify(v)})}`]);
      } else if (ts.isJsxExpression(init)) walkExpr(init.expression);
    } else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      if (!inside(node, ['style', 'script', 'code', 'pre'])) walkExpr(node.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) { console.log(`none   ${file}`); continue; }
  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, r] of edits) out = out.slice(0, s) + r + out.slice(e);
  if (!/from '@\/i18n\/client'/.test(out)) out = out.replace(/^(['"]use client['"];?\s*\n)/m, `$1import { tr } from '@/i18n/client';\n`);
  total += edits.length;
  console.log(`${String(edits.length).padStart(4)}   ${file}`);
  if (!dry) fs.writeFileSync(file, out);
}
console.log(`total edits: ${total}`);
