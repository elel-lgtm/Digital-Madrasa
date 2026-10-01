"""Behavioural figures: sequence, activity, QR flow, auth/RLS, schema map."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diag import *

OUT = sys.argv[1]

# ------------------------------------------------- Sequence: recitation (5.6)
fig, ax = canvas(9.0, 6.4)
title(ax, 'Sequence Diagram — Recitation Submission and Teacher Review')

lanes = [('Student\napp', 9), ('evaluate-\nrecitation', 29),
         ('Supabase\nStorage', 48), ('recitations /\ntajweed_feedback', 68),
         ('Teacher\napp', 90)]
for lbl, x in lanes:
    box(ax, x, 90, 17, 8, lbl, fill=ACCENT_FILL, fs=6.8, bold=True)
    ax.plot([x, x], [85.6, 10], color='#b9b2a4', lw=0.9, ls=(0, (3, 3)), zorder=0)

steps = [
    (9, 29, 80, '1  request signed upload URL'),
    (29, 29, 74, '2  authenticate, rate-limit, scope path to madrasa'),
    (29, 9, 68, '3  signed URL + storage path'),
    (9, 48, 61, '4  PUT audio to private bucket'),
    (9, 68, 54, '5  insert recitation row (RLS: own record only)'),
    (68, 68, 48, '6  AI evaluation foundation writes tajweed_feedback'),
    (90, 68, 41, '7  teacher opens grading queue (RLS: same madrasa)'),
    (90, 48, 34, '8  request short-lived signed playback URL'),
    (48, 90, 27, '9  audio stream (20-minute expiry)'),
    (90, 68, 20, '10  save teacher override; AI score preserved'),
    (68, 9, 13, '11  student and approved parent see reviewed result'),
]
for x1, x2, y, label in steps:
    if x1 == x2:
        ax.add_patch(FancyBboxPatch((x1 - 1.2, y - 1.6), 2.4, 3.2,
                     boxstyle='round,pad=0,rounding_size=0.3', lw=1.0,
                     edgecolor=LINE, facecolor=ACCENT_FILL, zorder=3))
        ax.text(x1 + 3.5, y, label, ha='left', va='center', fontsize=6.3, color=INK)
    else:
        arrow(ax, (x1, y), (x2, y))
        ax.text((x1 + x2) / 2, y + 2.1, label, ha='center', fontsize=6.3, color=INK)
save(fig, f'{OUT}/fig5-6-sequence.png')

# ------------------------------------------------- Activity: QR attendance (5.7)
fig, ax = canvas(7.0, 8.2)
title(ax, 'Activity Diagram — QR Attendance')

ax.add_patch(Ellipse((50, 93), 5, 3.4, facecolor=INK, edgecolor=INK, zorder=3))
flow = [
    ('Teacher opens class attendance', 85, FILL),
    ('System signs token:\nclassId . window . HMAC', 76, BLUE_FILL),
    ('QR displayed, rotating every 30 s', 67, FILL),
    ('Student opens scanner', 58, FILL),
    ('Camera decodes QR payload', 49, FILL),
]
for lbl, y, fl in flow:
    box(ax, 50, y, 46, 6.6, lbl, fill=fl, fs=7.2)

diamond(ax, 50, 39, 30, 9, 'Shape looks like\na token?', fs=6.6)
box(ax, 84, 39, 26, 7, 'Show "code could\nnot be read"', fill=RED_FILL, fs=6.6)
box(ax, 50, 28, 46, 6.6, 'POST token to attendance-qr function', fill=BLUE_FILL, fs=7.2)
diamond(ax, 50, 17, 34, 9, 'Signature, window,\nclass and role valid?', fs=6.4)
box(ax, 84, 17, 26, 7, 'Refuse: expired_code /\nwrong_class / 403', fill=RED_FILL, fs=6.4)
box(ax, 20, 7, 30, 6.6, 'Upsert attendance\n(student, date)', fill=GREEN_FILL, fs=6.8)
ax.add_patch(Ellipse((50, 1.5), 5, 3.2, facecolor='white', edgecolor=INK, lw=1.4, zorder=3))
ax.add_patch(Ellipse((50, 1.5), 3, 1.9, facecolor=INK, edgecolor=INK, zorder=4))

for y1, y2 in ((91.3, 88.3), (81.7, 79.3), (72.7, 70.3), (63.7, 61.3), (54.7, 52.3), (45.7, 43.5)):
    arrow(ax, (50, y1), (50, y2))
arrow(ax, (65, 39), (71, 39), 'no', fs=6.2, offset=(0, 1.4))
arrow(ax, (50, 34.5), (50, 31.3), 'yes', fs=6.2, offset=(3, 0))
arrow(ax, (50, 24.7), (50, 21.5))
arrow(ax, (67, 17), (71, 17), 'no', fs=6.2, offset=(0, 1.4))
arrow(ax, (50, 12.5), (35, 10.3), 'yes', fs=6.2, offset=(2, 1))
arrow(ax, (35, 7), (47.4, 2.4))
ax.text(50, -4, 'The scanner never decides validity: the signature, the 30-second window, the class\nand the caller’s role are all settled by the attendance-qr function',
        ha='center', fontsize=6.4, color=MUTED, style='italic')
save(fig, f'{OUT}/fig5-7-activity-qr.png')

# ------------------------------------------- Authentication / RLS flow (5.8)
fig, ax = canvas(8.6, 5.4)
title(ax, 'Authentication and Row Level Security Enforcement')

box(ax, 12, 74, 20, 9, 'Mobile client\n(anon key only)', fs=7.2)
box(ax, 42, 74, 22, 9, 'Supabase Auth\nGoTrue', fill=BLUE_FILL, fs=7.2)
box(ax, 78, 74, 24, 9, 'Signed JWT\n(sub = user id)', fill=ACCENT_FILL, fs=7.2)
arrow(ax, (22.5, 74), (30.5, 74), 'email + password', fs=6.2, offset=(0, 1.8))
arrow(ax, (53.5, 74), (65.5, 74), 'issues', fs=6.2, offset=(0, 1.8))

box(ax, 50, 52, 76, 8, 'Every PostgREST / Edge Function request carries the JWT',
    fill=FILL, fs=7.4)
arrow(ax, (78, 69), (60, 56.5))

box(ax, 20, 33, 30, 9, 'current_madrasa_id()\nreads profiles.madrasa_id', fill=GREEN_FILL, fs=6.8)
box(ax, 55, 33, 26, 9, 'current_role_name()\nreads profiles.role', fill=GREEN_FILL, fs=6.8)
box(ax, 85, 33, 22, 9, 'is_platform_admin()', fill=GREEN_FILL, fs=6.8)
arrow(ax, (35, 48), (22, 37.8)); arrow(ax, (52, 48), (55, 37.8))
arrow(ax, (68, 48), (83, 37.8))

box(ax, 50, 15, 76, 9,
    '81 RLS policies decide every row  ·  can_access_madrasa()  ·  can_read_student()',
    fill=ACCENT_FILL, fs=7.4, bold=True)
for x in (20, 55, 85):
    arrow(ax, (x, 28.3), (x if x < 80 else 70, 19.8))
ax.text(50, 5, 'SECURITY DEFINER helpers pin search_path; RLS is FORCED on all 38 tables,\nso even the table owner cannot bypass it',
        ha='center', fontsize=6.6, color=MUTED, style='italic')
save(fig, f'{OUT}/fig5-8-auth-rls.png')

# --------------------------------------------------- Class diagram (5.9)
fig, ax = canvas(8.8, 6.0)
title(ax, 'Class Diagram — Core Domain Model (TypeScript shared types)')

def cls(x, y, w, name, attrs):
    h = 6 + len(attrs) * 3.0
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                 boxstyle='round,pad=0,rounding_size=0.5', lw=1.1,
                 edgecolor=LINE, facecolor='white', zorder=2))
    ax.add_patch(FancyBboxPatch((x - w / 2, y + h / 2 - 5), w, 5,
                 boxstyle='round,pad=0,rounding_size=0.5', lw=1.1,
                 edgecolor=LINE, facecolor=ACCENT_FILL, zorder=3))
    ax.text(x, y + h / 2 - 2.5, name, ha='center', va='center', fontsize=7.2,
            fontweight='bold', zorder=4)
    for i, a in enumerate(attrs):
        ax.text(x - w / 2 + 1.6, y + h / 2 - 7.6 - i * 3.0, a, ha='left',
                va='center', fontsize=6.0, color=INK, zorder=4)
    return h

cls(17, 76, 28, 'Madrasa', ['id: ID', 'name, slug, county', 'status', 'ownerId'])
cls(52, 76, 28, 'Profile', ['id: ID (auth uid)', 'role: user_role', 'madrasaId', 'fullName, email'])
cls(86, 76, 24, 'Teacher', ['employeeNo', 'qiraahStyles[]', 'isOwner', 'status'])
cls(17, 42, 28, 'Student', ['admissionNo', 'classId', 'enrollmentStatus', 'dateOfBirth'])
cls(52, 42, 28, 'Recitation', ['surahNo, ayahFrom/To', 'qiraahStyle', 'audioUrl (path)', 'durationMs'])
cls(86, 42, 24, 'TajweedFeedback', ['overallScore', 'errors[]', 'teacherOverride', 'modelVersion'])
cls(17, 13, 28, 'Attendance', ['sessionDate', 'status', 'method: manual|qr'])
cls(52, 13, 28, 'Invoice', ['invoiceNo', 'amountDue/Paid', 'dueDate, status'])
cls(86, 13, 24, 'FeeStructure', ['amount, currency', 'appliesTo: fee_scope', 'classId / studentId'])

arrow(ax, (31, 76), (38, 76), '1  *', style='-', fs=6.2, offset=(0, 1.6))
arrow(ax, (66, 76), (74, 76), '1  1', style='-', fs=6.2, offset=(0, 1.6))
arrow(ax, (52, 67), (31, 50), '1  1', style='-', fs=6.2)
arrow(ax, (31, 42), (38, 42), '1  *', style='-', fs=6.2, offset=(0, 1.6))
arrow(ax, (66, 42), (74, 42), '1  0..1', style='-', fs=6.2, offset=(0, 1.6))
arrow(ax, (17, 33), (17, 21), '1  *', style='-', fs=6.2, offset=(3, 0))
arrow(ax, (31, 38), (38, 20), '1  *', style='-', fs=6.2)
arrow(ax, (66, 13), (74, 13), '*  1', style='-', fs=6.2, offset=(0, 1.6))
save(fig, f'{OUT}/fig5-9-class.png')
