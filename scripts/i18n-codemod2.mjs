// Second pass: messages and computed labels inside components.
//  - string/template arguments of setters and notifiers: setError('…'), showToast(`…${x}…`)
//  - text-like templates in JSX children and label attributes: {`Clear "${t}"…`}
//  - label-like properties of object literals built inside functions: { label: '…', desc: '…' }
//  - text branches of conditional initializers inside functions: const next = a ? 'Generating…' : 'Next →'
// Templates become tr("Clear \"{title}\"…", { title: t }). Never touches comparisons, switch cases,
// JSON.stringify/fetch bodies, or module-level constants.
import fs from 'node:fs';
import ts from 'typescript';

const dry = process.argv.includes('--dry');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const NOTIFY = /^(set[A-Z]\w*|showToast|toast|notify|alert|confirm|window\.confirm|window\.alert|flash|setNote|report)$/;
const PROPS = new Set(['label', 'desc', 'description', 'title', 'text', 'message', 'hint', 'placeholder', 'caption', 'blurb', 'summary', 'cost', 'watch', 'pictures', 'tooltip', 'help', 'empty', 'subtitle', 'heading', 'cta', 'note']);
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);
const looks = (s) => /[A-Za-z]{2}/.test(s) && (/\s/.test(s.trim()) || /^[A-Z]/.test(s.trim())) && !/^(https?:|\/|#|[a-z]+:)/.test(s.trim()) && !/(^|\s)(bg-|text-|border-|flex|grid|rounded|hover:|w-\d|h-\d|p[xytblr]?-\d|m[xytblr]?-\d)/.test(s) && !/^[a-z0-9_.-]+$/.test(s.trim());

const nameFor = (e, sf, used) => {
  let n = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) ? e.expression.expression.getText(sf).split('.').pop() : 'value';
  n = n.replace(/[^A-Za-z0-9]/g, '') || 'value';
  let k = n, i = 2;
  while (used.has(k)) k = `${n}${i++}`;
  used.add(k);
  return k;
};

let total = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (!/^['"]use client/m.test(text.slice(0, 40))) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const inFunction = (n) => { for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return true; return false; };
  const forbidden = (n) => {
    for (let p = n.parent; p && !ts.isFunctionLike(p); p = p.parent) {
      if (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind)) return true;
      if (ts.isCaseClause(p)) return true;
      if (ts.isCallExpression(p)) {
        const c = p.expression.getText(sf);
        if (/^(JSON\.stringify|fetch|console\.\w+|.*\.includes|.*\.startsWith|.*\.endsWith|.*\.indexOf|.*\.replace|.*\.split|.*\.match|tr)$/.test(c)) return true;
      }
      if (ts.isPropertyAssignment(p) && ['body', 'headers', 'method', 'key', 'id', 'className', 'href'].includes(p.name.getText(sf))) return true;
    }
    return false;
  };
  const wrap = (lit) => {
    if (forbidden(lit)) return;
    if (ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit)) {
      if (!looks(lit.text)) return;
      edits.push([lit.getStart(sf), lit.end, `tr(${JSON.stringify(lit.text)})`]);
    } else if (ts.isTemplateExpression(lit)) {
      const used = new Set();
      let key = lit.head.text; const vars = [];
      for (const span of lit.templateSpans) {
        const n = nameFor(span.expression, sf, used);
        key += `{${n}}` + span.literal.text;
        vars.push(`${n}: ${span.expression.getText(sf)}`);
      }
      if (!looks(key.replace(/\{\w+\}/g, 'X'))) return;
      edits.push([lit.getStart(sf), lit.end, `tr(${JSON.stringify(key)}, { ${vars.join(', ')} })`]);
    }
  };
  const textish = (e, fn) => {
    if (!e) return;
    if (ts.isParenthesizedExpression(e)) return textish(e.expression, fn);
    if (ts.isConditionalExpression(e)) { textish(e.whenTrue, fn); textish(e.whenFalse, fn); return; }
    if (ts.isBinaryExpression(e) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) { textish(e.left, fn); textish(e.right, fn); return; }
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e)) fn(e);
  };
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'tr') return;
    if (ts.isCallExpression(n) && NOTIFY.test(n.expression.getText(sf)) && inFunction(n)) for (const a of n.arguments) textish(a, wrap);
    if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent) || (ts.isJsxAttribute(n.parent) && ATTRS.has(n.parent.name.getText(sf))))) textish(n.expression, (e) => { if (ts.isTemplateExpression(e)) wrap(e); });
    if (ts.isPropertyAssignment(n) && PROPS.has(n.name.getText(sf).replace(/['"]/g, '')) && inFunction(n)) textish(n.initializer, wrap);
    if (ts.isVariableDeclaration(n) && n.initializer && inFunction(n) && ts.isConditionalExpression(n.initializer)) textish(n.initializer, wrap);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  // Drop edits nested inside other edits.
  edits.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const kept = [];
  for (const e of edits) if (!kept.some((k) => e[0] >= k[0] && e[1] <= k[1])) kept.push(e);
  kept.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [s, e, r] of kept) out = out.slice(0, s) + r + out.slice(e);
  if (!/from '@\/i18n\/client'/.test(out)) out = out.replace(/^(['"]use client['"];?\s*\n)/m, `$1import { tr } from '@/i18n/client';\n`);
  total += kept.length;
  console.log(`${String(kept.length).padStart(4)}   ${file}`);
  if (!dry) fs.writeFileSync(file, out);
}
console.log(`total edits: ${total}`);
