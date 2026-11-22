// Lists English text in client components that is not yet wrapped in tr().
import fs from 'node:fs';
import ts from 'typescript';
const SKIP_ATTR = new Set(['className','href','key','id','type','htmlFor','name','role','src','target','rel','method','accept','autoComplete','inputMode','encType','value','d','viewBox','fill','stroke','strokeLinecap','strokeLinejoin','xmlns','data-testid','style','as','sizes','position','mode','lang']);
const looks = (s) => /[A-Za-z]{2}/.test(s) && /\s/.test(s.trim()) && /^[A-Z"'“(✨⚠️🔑💡✅]/.test(s.trim()) && !/[{}<>]/.test(s) && !/^[a-z-]+:/.test(s) && !/(^|\s)(px|rem|bg-|text-|border|flex|grid|rounded|hover:|w-|h-|p[xytblr]?-|m[xytblr]?-)/.test(s);
let total=0; const byFile={};
for (const file of process.argv.slice(2)) {
  const text = fs.readFileSync(file,'utf8').replace(/^﻿/,'');
  if (!/^['"]use client/m.test(text.slice(0,40))) continue;
  const sf = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const hits=[];
  const visit=(n)=>{
    if (ts.isImportDeclaration(n)) return;
    if (ts.isCallExpression(n) && n.expression.getText(sf)==='tr') return;
    if (ts.isJsxAttribute(n) && SKIP_ATTR.has(n.name.getText(sf))) return;
    if (ts.isCallExpression(n) && /^(console\.\w+|fetch|JSON\.parse|new URL|.*\.replace|.*\.match|.*\.test|.*\.split|.*\.startsWith|.*\.includes)$/.test(n.expression.getText(sf))) return;
    let s=null;
    if (ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)) s=n.text;
    else if (ts.isTemplateExpression(n)) s=n.head.text+n.templateSpans.map(x=>'{}'+x.literal.text).join('');
    if (s!==null && looks(s.replace(/\{\}/g,'X'))) { hits.push(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1}: ${s.slice(0,90)}`); }
    ts.forEachChild(n,visit);
  };
  visit(sf);
  if (hits.length){ byFile[file]=hits; total+=hits.length; }
}
for (const [f,h] of Object.entries(byFile).sort((a,b)=>b[1].length-a[1].length)) console.log(`${h.length}\t${f}`);
console.log('total',total);
if (process.env.SHOW) for (const [f,h] of Object.entries(byFile)) if (f.includes(process.env.SHOW)) console.log(h.join('\n'));
