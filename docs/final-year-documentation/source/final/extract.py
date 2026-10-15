"""Turns a .docx into an ordered list of content blocks, saving embedded images.

Block types:
  heading  {level, text}
  para     {runs: [[text, bold, italic]], list: None|'bullet'|'number', style}
  image    {file, w_in, h_in}
  table    {rows: [[cell text]], header_bold}
  caption  {kind: 'Figure'|'Table', number, title}
  pagebreak

Usage: python extract.py A.docx A
"""
import io, json, os, re, sys
import docx
from docx.oxml.ns import qn
from PIL import Image

src, tag = sys.argv[1], sys.argv[2]
d = docx.Document(src)
os.makedirs(f'img_{tag}', exist_ok=True)
blocks = []
img_n = 0
CAP = re.compile(r'^(Figure|Table)\s+([0-9A-Z]+\.[0-9]+)[:.]?\s+(.*)$')

numfmt = {}
try:
    numbering = d.part.numbering_part.element
    abstract = {a.get(qn('w:abstractNumId')): a for a in numbering.findall(qn('w:abstractNum'))}
    for n in numbering.findall(qn('w:num')):
        aid = n.find(qn('w:abstractNumId')).get(qn('w:val'))
        lvl = abstract[aid].find(qn('w:lvl'))
        fmt = lvl.find(qn('w:numFmt'))
        numfmt[n.get(qn('w:numId'))] = fmt.get(qn('w:val')) if fmt is not None else 'bullet'
except Exception:
    pass


def save_images(el):
    global img_n
    out = []
    for blip in el.iter(qn('a:blip')):
        rid = blip.get(qn('r:embed'))
        if not rid or rid not in d.part.related_parts:
            continue
        blob = d.part.related_parts[rid].blob
        try:
            im = Image.open(io.BytesIO(blob))
        except Exception:
            continue
        img_n += 1
        name = f'img_{tag}/{tag}{img_n:03d}.png'
        if im.mode in ('P', 'LA', 'RGBA'):
            im = im.convert('RGBA')
            bg = Image.new('RGB', im.size, 'white')
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert('RGB')
        im.save(name)
        ext = None
        for anc in el.iter(qn('wp:extent')):
            ext = anc
            break
        w = int(ext.get('cx')) / 914400 if ext is not None else None
        h = int(ext.get('cy')) / 914400 if ext is not None else None
        out.append({'type': 'image', 'file': name, 'w_in': w, 'h_in': h, 'px': im.size})
    return out


def runs_of(p):
    runs = []
    for r in p.runs:
        t = r.text
        if not t:
            continue
        b = bool(r.bold) or (r.bold is None and p.style.font.bold is True)
        i = bool(r.italic)
        if runs and runs[-1][1] == b and runs[-1][2] == i:
            runs[-1][0] += t
        else:
            runs.append([t, b, i])
    return runs


ti = 0
for el in d.element.body.iterchildren():
    if el.tag == qn('w:p'):
        p = docx.text.paragraph.Paragraph(el, d)
        if any(b.get(qn('w:type')) == 'page' for b in el.iter(qn('w:br'))) or el.find('.//' + qn('w:pageBreakBefore')) is not None:
            blocks.append({'type': 'pagebreak'})
        blocks.extend(save_images(el))
        text = re.sub(r'\s+', ' ', p.text).strip()
        if not text:
            continue
        style = p.style.name
        m = CAP.match(text)
        if m and len(text) < 160:
            blocks.append({'type': 'caption', 'kind': m.group(1), 'number': m.group(2), 'title': m.group(3).strip()})
            continue
        if style.startswith('Heading') and style[-1] in '123':
            blocks.append({'type': 'heading', 'level': int(style[-1]), 'text': text})
            continue
        numpr = el.find('.//' + qn('w:numPr'))
        lst = None
        if numpr is not None:
            nid = numpr.find(qn('w:numId'))
            fmt = numfmt.get(nid.get(qn('w:val')) if nid is not None else '', 'bullet')
            lst = 'bullet' if fmt == 'bullet' else 'number'
        blocks.append({'type': 'para', 'runs': runs_of(p), 'list': lst, 'style': style})
    elif el.tag == qn('w:tbl'):
        tb = d.tables[ti]
        ti += 1
        imgs = save_images(el)
        rows = []
        for r in tb.rows:
            cells = []
            for c in r.cells:
                cells.append(re.sub(r'[ \t]+', ' ', c.text.strip().replace('\n', ' ')))
            rows.append(cells)
        blocks.append({'type': 'table', 'rows': rows, 'images': imgs})

json.dump(blocks, open(f'{tag}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(tag, len(blocks), 'blocks,', img_n, 'images')
