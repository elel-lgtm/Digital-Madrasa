import json, sys
def load(t): return json.load(open(f'{t}.json', encoding='utf-8'))
def text(b):
    if b['type'] == 'para': return ''.join(r[0] for r in b['runs'])
    if b['type'] == 'heading': return b['text']
    if b['type'] == 'caption': return f"{b['kind']} {b['number']} {b['title']}"
    if b['type'] == 'table': return 'TABLE ' + ' || '.join(' | '.join(r) for r in b['rows'])
    return b['type']
def section(blocks, prefix, level=None):
    out, on, lvl = [], False, None
    for b in blocks:
        if b['type'] == 'heading':
            if on and b['level'] <= lvl: break
            if not on and b['text'].startswith(prefix) and (level is None or b['level'] == level):
                on, lvl = True, b['level']; continue
        if on: out.append(b)
    return out
if __name__ == '__main__':
    t, pre = sys.argv[1], sys.argv[2]
    for b in section(load(t), pre):
        s = text(b)
        print(('  ' if b['type'] != 'heading' else '') + s[:int(sys.argv[3]) if len(sys.argv) > 3 else 400])
