"""Collect user-visible English strings from the native app, web app and landing page -> i18n/strings.json."""
import re, json, pathlib, html
root = pathlib.Path(__file__).resolve().parents[1]
out = {}
def add(s, where):
    s = s.strip()
    if re.search(r'[{}=<>;\n`]|=>|&&|\(\)|\bconst\b|className|onClick|var\(--', s): return   # code, not copy
    if re.search(r"\('|'\)|, \w+\.\w|calc\(|env\(|\?\?|^M\d|\.\w+\(|^[:;,.)]|\($", s): return
    if len(s) < 2 or not re.search(r'[A-Za-z]{2}', s): return
    if re.fullmatch(r'[a-z0-9_./:-]+', s): return            # ids, routes, keys
    if s.startswith(('http', 'app.forge', 'android', '#', 'food-', 'res/')): return
    out.setdefault(s, set()).add(where)
# Kotlin: string literals without templates, in UI-ish calls
kt_call = re.compile(r'\b(Text|Body|Eyebrow|Title|FButton|Chip|Notice|Screen|Sheet|Field|SettingRow|EmptyState|Spinner|ActionTile|ChartCard|label|placeholder|hint|title|sub|text|message|msg|err|error|notify)\b')
lit = re.compile(r'"((?:[^"\\$]|\\.)*)"')
for f in (root / 'native/app/src/main/java').rglob('*.kt'):
    src = f.read_text()
    for line in src.splitlines():
        if line.strip().startswith(('import', 'package', '//', '*', '/*')): continue
        for m in lit.finditer(line):
            s = m.group(1)
            if '\\' in s: s = s.replace('\\n', '\n').replace('\\"', '"')
            before = line[:m.start()]
            if kt_call.search(before) or re.search(r'(to|listOf\(|Triple\(|Pair\()\s*$', before) or ' ' in s:
                add(s, 'native')
# TSX: JSX text + quoted strings with a space
for f in list((root / 'src').rglob('*.tsx')) + [root / 'src/lib/seed.ts']:
    src = f.read_text()
    for m in re.finditer(r'>([^<>{}]*[A-Za-z][^<>{}]*)<', src): add(html.unescape(' '.join(m.group(1).split())), 'web')
    for m in re.finditer(r"'((?:[^'\\]|\\.)*)'", src):
        if ' ' in m.group(1) and '${' not in m.group(1): add(m.group(1).replace("\\'", "'"), 'web')
    for m in re.finditer(r'"([^"\n]*\s[^"\n]*)"', src):
        if 'className' not in src[max(0, m.start()-12):m.start()]: add(m.group(1), 'web')
# landing page
for f in (root / 'site').glob('*.html'):
    src = re.sub(r'<(script|style)[\s\S]*?</\1>', '', f.read_text())
    for m in re.finditer(r'>([^<>]*[A-Za-z][^<>]*)<', src): add(html.unescape(' '.join(m.group(1).split())), 'site')
    for m in re.finditer(r'(?:alt|placeholder|aria-label|title)="([^"]+)"', src): add(html.unescape(m.group(1)), 'site')
data = [{'en': k, 'where': sorted(v)} for k, v in sorted(out.items())]
(root / 'i18n/strings.json').write_text(json.dumps(data, ensure_ascii=False, indent=1))
print(len(data), {w: sum(w in d['where'] for d in data) for w in ('native', 'web', 'site')})
