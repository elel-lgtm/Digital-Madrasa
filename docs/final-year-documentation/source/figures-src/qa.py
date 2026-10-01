"""Automated checks on the generated PDF (the measurable part of the QA list)."""
import re, sys
import pymupdf

pdf = pymupdf.open(sys.argv[1])
N = len(pdf)
texts = [pg.get_text() for pg in pdf]
full = '\n'.join(texts)
print(f'1/2  opened: {N} pages, encrypted={pdf.is_encrypted}, metadata title={pdf.metadata.get("title")!r}')

# fonts embedded
fonts = {}
for pg in pdf:
    for f in pg.get_fonts():
        fonts[f[3]] = f[1]
unembedded = [n for n, ext in fonts.items() if ext in ('', 'n/a')]
print(f'     fonts: {len(fonts)}; not embedded: {unembedded or "none"}')

# locate front matter lists
def page_of(s):
    return next((i + 1 for i, t in enumerate(texts) if s in t), None)
toc, lof, lot, ch1 = page_of('TABLE OF CONTENTS'), page_of('LIST OF FIGURES'), page_of('LIST OF TABLES'), None
for i, t in enumerate(texts):
    if 'CHAPTER ONE' in t and i > (lot or 0):
        ch1 = i + 1
        break
print(f'8-10 TOC p{toc}, LoF p{lof}, LoT p{lot}, Chapter One p{ch1}')
front = '\n'.join(texts[(toc or 1) - 1:(ch1 or 1) - 1])
errs = [e for e in ('Error! Bookmark', 'No table of contents entries', 'Error! Reference') if e in full]
print(f'     field errors: {errs or "none"}')
lof_entries = re.findall(r'Figure ([A-Z0-9]+\.\d+): ', '\n'.join(texts[(lof or 1) - 1:(lot or 1) - 1]))
lot_entries = re.findall(r'Table ([A-Z0-9i]+(?:\.\d+)?): ', '\n'.join(texts[(lot or 1) - 1:(ch1 or 1) - 1]))
body = '\n'.join(texts[(ch1 or 1) - 1:])
body_figs = re.findall(r'Figure ([A-Z0-9]+\.\d+): ', body)
body_tabs = re.findall(r'Table ([A-Z0-9]+\.\d+): ', body)
print(f'     LoF entries {len(lof_entries)} vs captions {len(body_figs)};  LoT entries {len(lot_entries)} vs captions {len(body_tabs)}')
missing_lof = sorted(set(body_figs) - set(lof_entries))
missing_lot = sorted(set(body_tabs) - set(lot_entries))
print(f'     captions missing from lists: figures {missing_lof or "none"}, tables {missing_lot or "none"}')
toc_heads = re.findall(r'^(\d\.\d+(?:\.\d+)?) ', front, re.M)
print(f'     TOC numbered headings listed: {len(toc_heads)}')

# 6/15 caption and heading numbering order
def order_ok(nums):
    prev = None; bad = []
    for n in nums:
        a, b = n.split('.')
        key = (a, int(b))
        if prev and prev[0] == a and key[1] != prev[1] + 1:
            bad.append(f'{prev[0]}.{prev[1]}→{n}')
        prev = key
    return bad
print(f'6    figure numbering gaps: {order_ok(body_figs) or "none"};  table gaps: {order_ok(body_tabs) or "none"}')
heads = re.findall(r'^(\d)\.(\d+) [A-Z]', body, re.M)
chap_seq = []
for a, b in heads:
    if not chap_seq or chap_seq[-1] != a:
        chap_seq.append(a)
print(f'15   chapter order in body: {chap_seq[:12]}')

# 7 page numbers in footer
missing_num = []
for i, pg in enumerate(pdf):
    h = pg.rect.height
    foot = pg.get_text(clip=pymupdf.Rect(0, h - 60, pg.rect.width, h)).strip()
    if i >= (toc or 1) - 1 and not re.search(r'^([ivxlc]+|\d+)$', foot, re.M):
        missing_num.append(i + 1)
print(f'7    pages (from TOC on) without a footer page number: {missing_num or "none"}')

# 11 blank pages
blank = [i + 1 for i, pg in enumerate(pdf) if len(texts[i].strip()) < 60 and not pg.get_images()]
print(f'11   near-blank pages: {blank or "none"}')

# 12 overflow: any text or image outside the page / into margins
over = []
for i, pg in enumerate(pdf):
    W, H = pg.rect.width, pg.rect.height
    for b in pg.get_text('blocks'):
        x0, y0, x1, y1 = b[:4]
        if x0 < 36 or x1 > W - 36 or y1 > H - 20:
            over.append((i + 1, round(x0), round(x1)))
    for img in pg.get_image_info():
        x0, y0, x1, y1 = img['bbox']
        if x0 < 36 or x1 > W - 36 or y1 > H - 36:
            over.append((i + 1, 'img', round(x0), round(x1)))
print(f'12   blocks beyond 0.5in of the page edge: {over[:10] or "none"}')

# 13 distortion: displayed aspect vs intrinsic aspect
dist = []
for i, pg in enumerate(pdf):
    for img in pg.get_image_info(xrefs=True):
        x0, y0, x1, y1 = img['bbox']
        if img['width'] and img['height'] and (x1 - x0) > 20:
            r_disp = (x1 - x0) / (y1 - y0)
            r_img = img['width'] / img['height']
            if abs(r_disp / r_img - 1) > 0.02:
                dist.append((i + 1, round(r_disp, 3), round(r_img, 3)))
nimg = sum(len(pg.get_images()) for pg in pdf)
print(f'4/13 images: {nimg}; distorted (>2% aspect change): {dist or "none"}')

# 14 placeholders
ph = {k: full.count(k) for k in ('[INSERT SCREENSHOT HERE]', '[INSERT ACTUAL SURVEY RESULTS HERE]', '[INSERT GITHUB REPOSITORY LINK]', '[INSERT PLAGIARISM REPORT HERE]', '[INSERT]', '[INSERT DATE', '[CONFIRM')}
print(f'14   placeholders: {ph}')
# 16 references
refs_page = page_of('REFERENCES\n') or page_of('REFERENCES')
print(f'16   references start p{refs_page}; DOI links: {full.count("doi.org")}')
land = [i + 1 for i, pg in enumerate(pdf) if pg.rect.width > pg.rect.height]
print(f'     landscape pages: {land}')
