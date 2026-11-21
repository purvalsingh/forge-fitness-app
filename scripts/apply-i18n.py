"""Apply i18n/out_*.json: put the simplified English into the source (only real shortenings of long text),
and write the Hindi/Marathi dictionaries for the native app and the web app/landing page.
Dictionary keys are the final English as the app renders it."""
import json, glob, pathlib, re, html
root = pathlib.Path(__file__).resolve().parents[1]
rows = [r for f in sorted(glob.glob(str(root / 'i18n/out_*.json'))) for r in json.load(open(f))]

def worth(o, n):  # long text that got meaningfully shorter, nothing code-like
    return n != o and len(o) >= 50 and len(n) <= 0.85 * len(o) and '$' not in n and '{' not in n

def kt(s): return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')
srcs = list((root / 'native/app/src/main/java').rglob('*.kt')) + list((root / 'src').rglob('*.tsx')) + list((root / 'src/lib').glob('*.ts')) + list((root / 'site').glob('*.html'))
texts = {p: p.read_text() for p in srcs}
applied = 0
dicts = {'hi': {}, 'mr': {}}
for r in rows:
    o, n = r['en'].strip(), r['new_en'].strip()
    final = o
    if worth(o, n):
        hit = False
        for p, t in texts.items():
            if p.suffix == '.kt': pairs = [(f'"{kt(o)}"', f'"{kt(n)}"')]
            elif p.suffix == '.html': pairs = [(f'>{html.escape(o, quote=False)}<', f'>{html.escape(n, quote=False)}<'), (f'>{o}<', f'>{n}<')]
            else: pairs = [(f"'{o}'", "'" + n.replace("'", "\\'") + "'"), (f'"{o}"', f'"{n}"'), (f'>{o}<', f'>{n}<')]
            for a, b in pairs:
                if a in t: t = t.replace(a, b); hit = True
            texts[p] = t
        if hit: final = n; applied += 1
    for code in dicts:
        tr = (r.get(code) or '').strip()
        if tr and tr != final: dicts[code][final] = tr
        if tr and final != o: dicts[code][o] = tr   # any copy we could not rewrite still translates
        if tr and worth(o, n): dicts[code][n] = tr  # already rewritten on an earlier run
for p, t in texts.items():
    if p.read_text() != t: p.write_text(t)
for code, d in dicts.items():
    for out in (root / f'native/app/src/main/assets/i18n/{code}.json', root / f'public/i18n/{code}.json'):
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
print('rewrites applied:', applied, '| hi:', len(dicts['hi']), 'mr:', len(dicts['mr']))
