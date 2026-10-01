"""Compose real app screenshots into labelled side-by-side panels.
Screens are only scaled (aspect ratio kept), never edited.
usage: python compose.py <outdir>"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
SP = os.path.dirname(os.path.abspath(__file__))
FIG = r'C:/Users/Mohammednur/OneDrive/Desktop/ONLINE MADRASA APP/docs/final-year-documentation/previous/figures-v1'
D = f'{SP}/docshots'
S = f'{SP}/shots'
try:
    FONT = ImageFont.truetype('arial.ttf', 30)
except OSError:
    FONT = ImageFont.load_default()

PHONE_W = 520


def panel(name, items):
    phones = []
    for path, label in items:
        im = Image.open(path).convert('RGB')
        h = round(im.height * PHONE_W / im.width)
        phones.append((im.resize((PHONE_W, h), Image.LANCZOS), label))
    gap, pad, lab_h = 46, 24, 70
    H = max(p.height for p, _ in phones)
    W = pad * 2 + len(phones) * PHONE_W + (len(phones) - 1) * gap
    out = Image.new('RGB', (W, H + pad * 2 + lab_h), 'white')
    d = ImageDraw.Draw(out)
    for i, (p, label) in enumerate(phones):
        x = pad + i * (PHONE_W + gap)
        out.paste(p, (x, pad))
        d.rectangle([x - 1, pad - 1, x + PHONE_W, pad + p.height], outline='#9a9a9a', width=2)
        if len(phones) > 1 or label:
            tag = f'({chr(97 + i)}) {label}' if len(phones) > 1 else label
            tw = d.textlength(tag, font=FONT)
            d.text((x + (PHONE_W - tw) / 2, pad + H + 18), tag, fill='#333333', font=FONT)
    out.save(f'{OUT}/{name}.png', optimize=True)
    print(f'  {name}.png  {out.width}x{out.height}')


P = {
    # chapter 6.4 system interfaces
    'ui-auth': [(f'{FIG}/shot-signin.png', 'Welcome and language choice')],
    'ui-owner': [(f'{D}/owner-dashboard.png', 'Owner dashboard'),
                 (f'{D}/owner-link-requests.png', 'Parent link requests')],
    'ui-teacher': [(f'{D}/teacher-dashboard.png', 'Teacher dashboard')],
    'ui-parent': [(f'{D}/parent-dashboard.png', 'First child selected'),
                  (f'{D}/parent-child-switch.png', 'Second child selected')],
    'ui-student': [(f'{D}/student-dashboard.png', 'Student home'),
                   (f'{D}/student-learn.png', 'Assignments')],
    'ui-students': [(f'{FIG}/shot-students.png', 'Student list'),
                    (f'{FIG}/shot-student-new.png', 'Add a student'),
                    (f'{S}/13-created.png', 'Admission number issued')],
    'ui-staff': [(f'{D}/owner-staff.png', 'Staff list')],
    'ui-attendance': [(f'{S}/p3-02-roster.png', 'Manual marking'),
                      (f'{FIG}/shot-qr-display.png', 'Rotating QR code'),
                      (f'{FIG}/shot-attendance-marked.png', 'Student marked present')],
    'ui-quran': [(f'{D}/student-progress.png', 'Memorisation progress'),
                 (f'{D}/student-recite.png', 'Recite: passage selection'),
                 (f'{FIG}/shot-student-recitation.png', 'Provisional feedback')],
    'ui-review': [(f'{FIG}/shot-teacher-review.png', 'Teacher review and override')],
    'ui-monitor': [(f'{D}/parent-child-progress.png', 'Progress'),
                   (f'{D}/parent-child-attendance.png', 'Attendance'),
                   (f'{D}/parent-child-grades.png', 'Grades')],
    'ui-comms': [(f'{D}/owner-announcements.png', 'Announcements'),
                 (f'{D}/parent-more.png', 'Parent settings and notifications')],
    'ui-fees': [(f'{FIG}/shot-fees.png', 'Fees overview'),
                (f'{FIG}/shot-invoice-review.png', 'Review billing run'),
                (f'{FIG}/shot-invoice-issued.png', 'Invoices issued')],
    'ui-parent-fees': [(f'{D}/parent-fees.png', 'Parent fees view')],
    'ui-ai': [(f'{D}/parent-ai-assistant.png', 'Assistant screen'),
              (f'{D}/parent-ai-unreachable.png', 'Gateway not running')],
    'ui-offline': [(f'{D}/student-offline-library.png', 'Offline library screen')],
    # 6.8 localisation
    'ui-i18n': [(f'{D}/settings-language.png', 'Language selector'),
                (f'{D}/arabic-settings.png', 'Arabic selected'),
                (f'{D}/arabic-rtl-home.png', 'Arabic parent home')],
    # chapter 7 evidence
    'ev-qr-expired': [(f'{FIG}/shot-qr-scanner.png', 'Expired token rejected')],
    'ev-inbox-crash': [(f'{D}/parent-inbox.png', 'Parent inbox render error')],
    'ev-student-more': [(f'{D}/student-more.png', 'Student More menu'),
                        (f'{D}/student-recitations.png', 'My recitations (empty)')],
}
ONLY = sys.argv[2:]

for name, items in P.items():
    if not ONLY or name in ONLY:
        panel(name, items)
