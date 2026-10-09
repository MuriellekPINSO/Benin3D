# Aligne l'ancien code français et sa traduction anglaise, jeton par jeton, et en tire les
# dictionnaires : textes du code (chaînes, gabarits, expressions régulières), commentaires, HTML.
#   python3 scripts/i18n/extraire.py <jetons-fr.json> <jetons-en.json> <index-fr.html> <index-en.html> <sortie-dossier>
import json, sys, difflib, re, os
fr, en = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
hfr, hen, sortie = open(sys.argv[3]).read(), open(sys.argv[4]).read(), sys.argv[5]
sig = lambda t: t['k'] if t['k'] != 'C' else 'C' + t['sig']
textes, coms, bilan = {}, {}, []
for f in sorted(fr):
    if f not in en: continue
    a, b = fr[f]['jetons'], en[f]['jetons']
    ca, cb = {}, {}
    for c in fr[f]['coms']: ca.setdefault(c['avant'], []).append(c['raw'])
    for c in en[f]['coms']: cb.setdefault(c['avant'], []).append(c['raw'])
    m = difflib.SequenceMatcher(None, [sig(t) for t in a], [sig(t) for t in b], autojunk=False)
    d, dc = {}, {}
    for op, i1, i2, j1, j2 in m.get_opcodes():
        if op == 'equal' or (op == 'replace' and i2 - i1 == j2 - j1):
            for i, j in zip(range(i1, i2), range(j1, j2)):
                if a[i]['k'] != 'C' and a[i]['k'] == b[j]['k'] and a[i]['raw'] != b[j]['raw'] and a[i]['raw'] not in d: d[a[i]['raw']] = b[j]['raw']
                for x, y in zip(ca.get(i, []), cb.get(j, [])):
                    if x != y and x not in dc: dc[x] = y
        # commentaires en fin de fichier
    for x, y in zip(ca.get(len(a), []), cb.get(len(b), [])):
        if x != y: dc[x] = y
    if d: textes[f] = d
    if dc: coms[f] = dc
    bilan.append(f'{f}: {len(d)} textes, {len(dc)} commentaires')
# HTML : textes entre balises et attributs lisibles (title, aria-label, placeholder, alt, content), dans l'ordre.
def morceaux(h):
    out = []
    for m in re.finditer(r'<[^>]+>|[^<]+', h):
        s = m.group(0)
        if s.startswith('<'):
            for am in re.finditer(r'\b(title|aria-label|placeholder|alt|content)="([^"]*)"', s): out.append(('A', am.group(2)))
            out.append(('B', re.sub(r'"[^"]*"', '""', s)))
        elif s.strip(): out.append(('X', s.strip()))
    return out
ma, mb = morceaux(hfr), morceaux(hen)
m = difflib.SequenceMatcher(None, [k if k != 'B' else v for k, v in ma], [k if k != 'B' else v for k, v in mb], autojunk=False)
html = {}
for op, i1, i2, j1, j2 in m.get_opcodes():
    if op == 'equal' or (op == 'replace' and i2 - i1 == j2 - j1):
        for i, j in zip(range(i1, i2), range(j1, j2)):
            if ma[i][0] in 'AX' and ma[i][0] == mb[j][0] and ma[i][1] != mb[j][1] and ma[i][1] not in html: html[ma[i][1]] = mb[j][1]
os.makedirs(sortie, exist_ok=True)
json.dump(textes, open(f'{sortie}/en-textes.json', 'w'), ensure_ascii=False, indent=1)
json.dump(coms, open(f'{sortie}/en-commentaires.json', 'w'), ensure_ascii=False, indent=1)
json.dump(html, open(f'{sortie}/en-html.json', 'w'), ensure_ascii=False, indent=1)
print(f"textes {sum(len(v) for v in textes.values())}, commentaires {sum(len(v) for v in coms.values())}, html {len(html)}")
