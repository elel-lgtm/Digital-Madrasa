"""Merge the live schema (schema.json) with what only the migrations record:
inline CHECK expressions, ON DELETE actions, composite UNIQUE groups and
table-level constraints. Output: schema2.json, the single model behind every
ERD and entity table in the report."""
import json, re, glob, os, sys

SP = sys.argv[1]
MIG = sys.argv[2]
live = json.load(open(f'{SP}/schema.json'))

# composite vs single UNIQUE, from the constraint names in cons.txt
line_re = re.compile(r'(\w+)=(.*?)(?=\s{2}\w+=|$)')
groups = {}
for line in open(f'{SP}/cons.txt', encoding='utf-8'):
    r = {k: v.strip() for k, v in line_re.findall(line.strip())}
    if r.get('ct') == 'UNIQUE':
        groups.setdefault((r['t'], r['cname']), []).append(r['col'])
for t in live.values():
    t['uniques'] = []
    for c in t['columns']:
        c['unique'] = False
for (t, _), cols in groups.items():
    if t not in live:
        continue
    if len(cols) == 1:
        next(c for c in live[t]['columns'] if c['name'] == cols[0])['unique'] = True
    else:
        live[t]['uniques'].append(sorted(cols))


def balanced(s, i):
    """s[i] == '(' ; return index after the matching ')'."""
    depth = 0
    for j in range(i, len(s)):
        if s[j] == '(':
            depth += 1
        elif s[j] == ')':
            depth -= 1
            if depth == 0:
                return j + 1
    return len(s)


def split_top(body):
    parts, depth, cur = [], 0, ''
    for ch in body:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == ',' and depth == 0:
            parts.append(cur)
            cur = ''
        else:
            cur += ch
    parts.append(cur)
    return [p.strip() for p in parts if p.strip()]


def strip_comments(sql):
    return re.sub(r'--[^\n]*', '', sql)


def norm(s):
    return re.sub(r'\s+', ' ', s).strip()


checks = {}      # (table, col) -> [expr]
ondelete = {}    # (table, col) -> action
tconstr = {}     # table -> [text]
for path in sorted(glob.glob(os.path.join(MIG, '*.sql'))):
    sql = strip_comments(open(path, encoding='utf-8').read())
    for m in re.finditer(r'create table (?:if not exists )?public\.(\w+)\s*\(', sql, re.I):
        table = m.group(1)
        end = balanced(sql, m.end() - 1)
        body = sql[m.end():end - 1]
        for part in split_top(body):
            p = norm(part)
            low = p.lower()
            if low.startswith(('constraint', 'unique', 'primary key', 'check', 'foreign key')):
                tconstr.setdefault(table, []).append(p)
                continue
            col = p.split(' ')[0]
            for cm in re.finditer(r'check\s*\(', p, re.I):
                s = cm.end() - 1
                checks.setdefault((table, col), []).append(norm(p[s + 1:balanced(p, s) - 1]))
            od = re.search(r'on delete (cascade|set null|restrict|no action)', p, re.I)
            if od:
                ondelete[(table, col)] = od.group(1).upper()
    for m in re.finditer(r'alter table (?:only )?public\.(\w+)\s+add constraint (\w+)\s+(.*?);',
                         sql, re.I | re.S):
        table, name, rest = m.group(1), m.group(2), norm(m.group(3))
        od = re.search(r'foreign key \((\w+)\).*?on delete (cascade|set null|restrict)', rest, re.I)
        if od:
            ondelete[(table, od.group(1))] = od.group(2).upper()
        else:
            tconstr.setdefault(table, []).append(f'constraint {name} {rest}')
    for m in re.finditer(r'alter table (?:only )?public\.(\w+)\s+add column (?:if not exists )?(\w+)\s+([^;]*);',
                         sql, re.I | re.S):
        table, col, rest = m.group(1), m.group(2), norm(m.group(3))
        for cm in re.finditer(r'check\s*\(', rest, re.I):
            s = cm.end() - 1
            checks.setdefault((table, col), []).append(norm(rest[s + 1:balanced(rest, s) - 1]))
        od = re.search(r'on delete (cascade|set null|restrict)', rest, re.I)
        if od:
            ondelete[(table, col)] = od.group(1).upper()

for tname, t in live.items():
    for c in t['columns']:
        c['checks'] = checks.get((tname, c['name']), [])
        if c['fk']:
            c['fk']['on_delete'] = ondelete.get((tname, c['name']), 'NO ACTION')
    t['constraints'] = [x for x in tconstr.get(tname, [])
                        if not x.lower().startswith('unique')]

json.dump(live, open(f'{SP}/schema2.json', 'w'), indent=1)
nchk = sum(len(c['checks']) for t in live.values() for c in t['columns'])
print(f'  tables {len(live)}  column checks {nchk}  '
      f'table constraints {sum(len(t["constraints"]) for t in live.values())}  '
      f'composite uniques {sum(len(t["uniques"]) for t in live.values())}  '
      f'fks with action {sum(1 for t in live.values() for c in t["columns"] if c["fk"] and c["fk"]["on_delete"] != "NO ACTION")}')
