"""Render Graphviz SVGs to PNG with PyMuPDF (no Cairo/Inkscape needed).
usage: python render.py <svg-dir> <png-dir> [name ...]"""
import sys, os, glob
import fitz

src, dst = sys.argv[1], sys.argv[2]
names = sys.argv[3:] or [os.path.splitext(os.path.basename(p))[0]
                         for p in glob.glob(os.path.join(src, '*.svg'))]
for n in names:
    doc = fitz.open(os.path.join(src, n + '.svg'))
    page = doc[0]
    # aim for ~2400 px on the long side, never below 2x
    long_side = max(page.rect.width, page.rect.height)
    zoom = max(2.0, min(4.0, 2600 / long_side))
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    out = os.path.join(dst, n + '.png')
    pix.save(out)
    print(f'  {n}.png  {pix.width}x{pix.height}')
