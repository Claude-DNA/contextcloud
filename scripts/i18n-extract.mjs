// Collects every interface string to translate into src/i18n/keys.json.
import fs from 'node:fs';
import ts from 'typescript';
import { execSync } from 'node:child_process';
const looks = (s) => /[A-Za-z]{2}/.test(s) && !/^(https?:|\/|#|@\/|\.\/|[a-z]+\/[a-z])/.test(s.trim()) && !/(^|\s)(bg-|text-|border|flex|grid|rounded|hover:|w-\d|h-\d|p[xytblr]?-\d|m[xytblr]?-\d|items-|justify-|gap-|shadow|transition|font-)/.test(s) && !/^[a-z0-9_.:\[\]#-]+$/.test(s.trim()) && !/^[A-Z_]+$/.test(s.trim()) && s.length < 700 && !/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE)\b/.test(s);
const keys = new Set();
const all = execSync("find src -name '*.tsx' -o -name '*.ts' | grep -v '^src/i18n'").toString().trim().split('\n');
for (const file of all) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isApi = file.startsWith('src/app/api/');
  const isUi = file.endsWith('.tsx') || /src\/lib\/state-formula\.ts$|src\/components\/graph\/nodeTypes\.ts$/.test(file);
  const visit = (n) => {
    if (ts.isCallExpression(n) && n.expression.getText(sf) === 'tr' && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) keys.add(n.arguments[0].text);
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && looks(n.text)) {
      const p = n.parent;
      if (isUi && !(ts.isJsxAttribute(p) && ['className', 'href', 'id', 'type', 'key', 'd', 'viewBox'].includes(p.name.getText(sf)))) keys.add(n.text);
      if (isApi && ts.isPropertyAssignment(p) && ['error', 'message', 'hint'].includes(p.name.getText(sf))) keys.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
const list = [...keys].filter((k) => k.trim()).sort();
fs.writeFileSync('src/i18n/keys.json', JSON.stringify(list, null, 1));
console.log(list.length, 'keys');
