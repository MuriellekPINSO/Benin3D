// Découpe un fichier JS en jetons (acorn) : les textes (chaînes, morceaux de gabarits `…${}…`,
// expressions régulières) sont marqués « à traduire », le reste sert à aligner deux versions d'un
// même fichier. Les commentaires sont rattachés au jeton qui les suit.
import { tokenizer } from 'acorn';
export function jetons(code, avecCommentaires = false) {
  const out = [], coms = [];
  const opts = { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, onComment: avecCommentaires ? (bloc, texte, start, end) => coms.push({ raw: code.slice(start, end), start, end }) : undefined };
  for (const t of tokenizer(code, opts)) {
    const l = t.type.label, raw = code.slice(t.start, t.end);
    if (l === 'string') out.push({ k: 'S', raw, start: t.start, end: t.end });
    else if (l === 'template') out.push({ k: 'T', raw, start: t.start, end: t.end });
    else if (l === 'regexp') out.push({ k: 'R', raw, start: t.start, end: t.end });
    else out.push({ k: 'C', sig: l === 'name' || l === 'num' ? `${l}:${raw}` : l, start: t.start, end: t.end });
  }
  if (avecCommentaires) { let i = 0; for (const c of coms) { while (i < out.length && out[i].start < c.end) i++; c.avant = i; } }
  return avecCommentaires ? { jetons: out, coms } : out;
}
/** Remplace, dans `code`, les textes présents dans les dictionnaires (celui du fichier, puis le commun). */
export function traduire(code, dico = {}, commun = {}, coms = null) {
  const { jetons: js, coms: cs } = jetons(code, true), rem = [];
  for (const t of js) if (t.k !== 'C') { const r = dico[t.raw] ?? commun[t.raw]; if (r !== undefined && r !== t.raw) rem.push([t.start, t.end, r]); }
  if (coms) for (const c of cs) { const r = coms[c.raw]; if (r !== undefined) rem.push([c.start, c.end, r]); }
  rem.sort((a, b) => b[0] - a[0]);
  for (const [a, b, r] of rem) code = code.slice(0, a) + r + code.slice(b);
  return code;
}
