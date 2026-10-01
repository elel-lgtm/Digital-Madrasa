"""Version 3 screenshot panels, from the web build in mock mode (30 Sep 2026).
Screens are only scaled (aspect ratio kept), never edited.
usage: python compose3.py <scratchpad> <outdir>"""
import sys
from PIL import Image, ImageDraw, ImageFont

SP, OUT = sys.argv[1], sys.argv[2]
try:
    FONT = ImageFont.truetype('arial.ttf', 30)
except OSError:
    FONT = ImageFont.load_default()


def panel(name, items, phone_w=520, max_h=None):
    phones = []
    for path, label in items:
        im = Image.open(f'{SP}/{path}').convert('RGB')
        if max_h:  # crop long full-page captures to a phone-like height
            ratio = max_h / phone_w
            im = im.crop((0, 0, im.width, min(im.height, round(im.width * ratio))))
        h = round(im.height * phone_w / im.width)
        phones.append((im.resize((phone_w, h), Image.LANCZOS), label))
    gap, pad, lab_h = 46, 24, 70
    H = max(p.height for p, _ in phones)
    W = pad * 2 + len(phones) * phone_w + (len(phones) - 1) * gap
    out = Image.new('RGB', (W, H + pad * 2 + lab_h), 'white')
    d = ImageDraw.Draw(out)
    for i, (p, label) in enumerate(phones):
        x = pad + i * (phone_w + gap)
        out.paste(p, (x, pad))
        d.rectangle([x - 1, pad - 1, x + phone_w, pad + p.height], outline='#bdb6a8', width=2)
        tw = d.textlength(label, font=FONT)
        d.text((x + (phone_w - tw) / 2, pad + H + 18), label, fill='#333333', font=FONT)
    out.save(f'{OUT}/{name}.png')
    print(f'  wrote {name}.png  {out.width}x{out.height}')


PHONE = 1127  # 390 x 844 aspect at 520 px wide
panel('ui-payment', [('docshots-v3/pay-1-form.png', 'Choose M-Pesa'),
                     ('docshots-v3/pay-2-waiting.png', 'STK prompt sent'),
                     ('docshots-v3/pay-3-success.png', 'Receipt issued'),
                     ('docshots-v3/pay-4-inbox.png', 'Receipt notice')])
panel('ui-learning', [('flow-shots/01-student-handed-in.png', 'Student hands in'),
                      ('flow-shots/04-teacher-marked.png', 'Teacher marks'),
                      ('flow-shots/05-hifz-saved.png', 'Memorisation update')], max_h=PHONE)
panel('ui-certificates', [('flow-shots/06-student-page.png', 'Pupil record'),
                          ('flow-shots/08-verified.png', 'Public verification'),
                          ('flow-shots/09-parent-child.png', 'Parent view')], max_h=PHONE)
panel('ui-languages', [('rtl-shots-ar/teacher-dashboard.png', 'Arabic'),
                       ('rtl-shots-sw/parent-dashboard.png', 'Kiswahili'),
                       ('rtl-shots-so/student-dashboard.png', 'Somali')], max_h=PHONE)
for src, name in [('admin-shots/01-overview.png', 'ui-admin-overview'),
                  ('admin-shots/03-detail.png', 'ui-admin-detail'),
                  ('admin-shots/05-audit.png', 'ui-admin-audit')]:
    im = Image.open(f'{SP}/{src}').convert('RGB')
    im = im.crop((0, 0, im.width, min(im.height, 860)))
    framed = Image.new('RGB', (im.width + 4, im.height + 4), '#bdb6a8')
    framed.paste(im, (2, 2))
    framed.save(f'{OUT}/{name}.png')
    print(f'  wrote {name}.png  {framed.width}x{framed.height}')
