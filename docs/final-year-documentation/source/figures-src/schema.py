"""Parse the live-schema query output into one model used by every schema figure
and table in the report, so the ERD and the entity tables cannot disagree."""
import json, re, sys

SP = sys.argv[1]
line_re = re.compile(r'(\w+)=(.*?)(?=\s{2}\w+=|$)')


def rows(path):
    out = []
    for line in open(path, encoding='utf-8', errors='replace'):
        if '=' not in line or line.startswith('{'):
            continue
        out.append({k: v.strip() for k, v in line_re.findall(line.strip())})
    return out


tables = {}
for r in rows(f'{SP}/cols.txt'):
    if 't' not in r:
        continue
    tables.setdefault(r['t'], {'columns': []})['columns'].append({
        'name': r['col'], 'type': r['typ'], 'nullable': r['nul'] == 'YES',
        'default': r.get('def', ''), 'pk': False, 'fk': None, 'unique': False,
    })

for r in rows(f'{SP}/cons.txt'):
    t = tables.get(r.get('t'))
    if not t:
        continue
    col = next((c for c in t['columns'] if c['name'] == r['col']), None)
    if not col:
        continue
    if r['ct'] == 'PRIMARY KEY':
        col['pk'] = True
    elif r['ct'] == 'FOREIGN KEY':
        col['fk'] = {'table': r['ref_t'], 'column': r['ref_c']}
    elif r['ct'] == 'UNIQUE':
        col['unique'] = True

json.dump(tables, open(f'{SP}/schema.json', 'w'), indent=1)
fks = sum(1 for t in tables.values() for c in t['columns'] if c['fk'])
print(f'  tables {len(tables)}   columns {sum(len(t["columns"]) for t in tables.values())}   '
      f'foreign keys {fks}   primary-key columns '
      f'{sum(1 for t in tables.values() for c in t["columns"] if c["pk"])}')
