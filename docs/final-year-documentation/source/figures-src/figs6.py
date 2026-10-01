"""Use case (5.x) and corrected recitation sequence diagram (5.x).
usage: python figs6.py <outdir>"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diag import *

OUT = sys.argv[1]

# ------------------------------------------------------------------ Use case
fig, ax = canvas(9.2, 10.4)
ax.add_patch(FancyBboxPatch((24, 3), 52, 94, boxstyle='round,pad=0,rounding_size=1',
             lw=1.1, edgecolor='#b8b0a0', facecolor='#fcfaf5', zorder=0))
ax.text(50, 95, 'DIGITAL MADRASA', ha='center', fontsize=8, fontweight='bold', color=MUTED)

L, R = 38.5, 61.5          # use-case columns
W, H = 21, 4.1
left = {
    'reg':   ('Register madrasa', 85),
    'admit': ('Admit student\n(admission no. issued)', 79.5),
    'class': ('Manage classes\nand staff', 74),
    'fees':  ('Define fees and\nissue invoices', 68.5),
    'link':  ('Decide parent\nlink requests', 61),
    'ann':   ('Post announcements', 55.5),
    'att':   ('Take attendance', 50),
    'qr':    ('Display rotating\nQR code', 44.5),
    'grade': ('Record grades and\nassignments', 39),
    'rev':   ('Review recitation,\noverride score', 33.5),
    'life':  ('Suspend / reinstate /\nschedule / purge madrasa', 12),
}
right = {
    'scan':  ('Scan class QR code', 83),
    'rec':   ('Record recitation', 77),
    'prog':  ('View memorisation\nprogress and work', 71),
    'ai':    ('Ask AI assistant\n(experimental)', 63),
    'preg':  ('Create account and\nrequest child link', 55),
    'child': ('View child progress,\nattendance, grades', 49),
    'inv':   ('View invoices\nand balance', 43),
    'msg':   ('Message the\nmadrasa', 37),
}
oval(ax, 50, 91, 16, 3.4, 'Sign in', fs=6.8)
for k, (lbl, y) in left.items():
    oval(ax, L, y, W, H, lbl, fs=6.2)
for k, (lbl, y) in right.items():
    oval(ax, R, y, W, H, lbl, fs=6.2)

actor(ax, 9, 78, 'Owner')
actor(ax, 9, 44, 'Teacher')
actor(ax, 9, 10, 'Platform\nadmin')
actor(ax, 91, 76, 'Student')
actor(ax, 91, 44, 'Parent')


def line(a, b):
    ax.plot([a[0], b[0]], [a[1], b[1]], color=LINE, lw=0.8, zorder=1)


for k in ('reg', 'admit', 'class', 'fees'):
    line((11.5, 80), (L - W / 2, left[k][1]))
for k in ('link', 'ann', 'att', 'qr', 'grade', 'rev'):
    line((11.5, 46), (L - W / 2, left[k][1]))
line((11.5, 12), (L - W / 2, left['life'][1]))
for k in ('scan', 'rec', 'prog', 'ai'):
    line((88.5, 78), (R + W / 2, right[k][1]))
for k in ('ai', 'preg', 'child', 'inv', 'msg'):
    line((88.5, 46), (R + W / 2, right[k][1]))
# sign-in associations run up the margins inside the boundary so they cross no use case
for x, y in ((11.5, 82), (11.5, 48)):
    ax.plot([x, 26, 26, 42], [y, y, 91, 91], color=LINE, lw=0.8, zorder=1)
for x, y in ((88.5, 80), (88.5, 48)):
    ax.plot([x, 74, 74, 58], [y, y, 91, 91], color=LINE, lw=0.8, zorder=1)

# generalisation: an owner is a teacher with is_owner = true
ax.add_patch(FancyArrowPatch((9, 66.5), (9, 53.8), arrowstyle='-|>', mutation_scale=16,
             lw=1.1, color=LINE, fc='white', zorder=3))
ax.text(10.5, 60, 'is a\n(is_owner)', fontsize=6.2, color=MUTED, va='center')
save(fig, f'{OUT}/fig5-usecase.png')

# ------------------------------------------------ Sequence: recitation review
fig, ax = canvas(9.4, 7.4)
lanes = [('Student\napp', 10.5), ('evaluate-recitation\n(Edge Function)', 28),
         ('Storage\n(private bucket)', 48), ('recitations /\ntajweed_feedback', 68),
         ('Teacher\napp', 91)]
for lbl, x in lanes:
    box(ax, x, 94, 17.5, 7, lbl, fill=ACCENT_FILL, fs=6.6, bold=True)
    ax.plot([x, x], [90.4, 3], color='#b9b2a4', lw=0.9, ls=(0, (3, 3)), zorder=0)

steps = [
    (10.5, 28, 85, '1  request upload URL (surah, ayahs)'),
    (28, 28, 79, '2  verify JWT, rate-limit, path madrasa/{id}/recitations/…'),
    (28, 10.5, 73, '3  signed upload URL + storage path'),
    (10.5, 48, 67, '4  PUT audio'),
    (10.5, 28, 61, '5  evaluate (storage path, surah, ayahs)'),
    (28, 68, 55, '6  insert recitation row (path must be in caller’s tenant folder)'),
    (28, 68, 49, '7  insert provisional feedback (model placeholder-v1)'),
    (28, 10.5, 43, '8  provisional result, labelled as such'),
    (91, 68, 36, '9  open review queue (RLS: same madrasa)'),
    (91, 48, 30, '10  request signed playback URL (20 min; storage policy decides)'),
    (48, 91, 24, '11  audio'),
    (91, 68, 18, '12  save teacher_override (automated values kept)'),
    (68, 10.5, 11, '13  reviewed result visible to student and approved parent'),
]
for x1, x2, y, label in steps:
    if x1 == x2:
        ax.add_patch(FancyBboxPatch((x1 - 1.2, y - 1.6), 2.4, 3.2,
                     boxstyle='round,pad=0,rounding_size=0.3', lw=1.0,
                     edgecolor=LINE, facecolor=ACCENT_FILL, zorder=3))
        ax.text(x1 + 2.5, y, label, ha='left', va='center', fontsize=6.2, color=INK)
    else:
        arrow(ax, (x1, y), (x2, y), dashed=label.startswith(('3', '8', '11', '13')))
        ax.text((x1 + x2) / 2, y + 2.0, label, ha='center', fontsize=6.2, color=INK)
save(fig, f'{OUT}/fig5-sequence.png')
