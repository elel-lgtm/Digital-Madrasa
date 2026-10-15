"""Figures for the final report that must reflect the finished system.

  fig5-3-component.png   component diagram (mobile app and Supabase subsystems)
  fig5-9-tables.png      share of the 42 tables by functional area
  fig7-1-unit-tests.png  the 185 unit tests grouped by area (from a Vitest JSON run)
  fig7-2-deployment.png  deployment diagram

Usage: python figs_final.py <out dir> <vitest json>
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diag import *  # noqa: F401,F403  (canvas, box, cyl, arrow, save, colours)
import matplotlib.pyplot as plt

OUT, VITEST = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PALETTE = ['#1f4e79', '#2e75b6', '#9dc3e6', '#c55a11', '#f4b183', '#548235',
           '#a9d18e', '#7f6000', '#bf9000', '#7030a0', '#b4a7d6', '#5a5a5a']


def pie(path, heading, labels, values):
    total = sum(values)
    fig, ax = plt.subplots(figsize=(8.2, 3.6))
    wedges, _, autos = ax.pie(values, colors=PALETTE[:len(values)], startangle=90, counterclock=False,
                              autopct=lambda v: f'{v:.1f}%' if v >= 4 else '', pctdistance=0.72,
                              wedgeprops=dict(linewidth=1, edgecolor='white'), textprops=dict(fontsize=7.5))
    for t, w in zip(autos, wedges):
        t.set_color('white' if w.get_facecolor()[0] < 0.6 else INK)
    ax.set_aspect('equal')
    ax.legend(wedges, [f'{l} — {v} ({100 * v / total:.1f}%)' for l, v in zip(labels, values)],
              loc='center left', bbox_to_anchor=(1.02, 0.5), frameon=False, fontsize=8)
    ax.set_title(heading, fontsize=9, fontweight='bold', loc='left')
    save(fig, path)


# ---------------------------------------------------------------- unit tests
run = json.load(open(VITEST, encoding='utf-8'))
assert run['numPassedTests'] == run['numTotalTests']
GROUPS = [
    ('Tajweed assessment', ['tajweed.test.ts']),
    ('M-Pesa and card payments', ['mpesa.test.ts', 'card.test.ts']),
    ('Memorisation and hifz plan', ['hifz.test.ts', 'hifzPlan.test.ts', 'heatmap.test.ts']),
    ('Helpers and Hijri dates', ['helpers.test.ts', 'hijri.test.ts']),
    ('Input validation', ['schemas.test.ts']),
    ('Offline, live room, videos, certificates', ['outbox.test.ts', 'halaqa.test.ts', 'youtube.test.ts', 'html.test.ts']),
    ('Streaks and badges', ['achievements.test.ts']),
    ('Recitation practice', ['reciteAlong.test.ts', 'masterReciter.test.ts', 'quranData.test.ts']),
    ('Teacher insights and spoken reports', ['insights.test.ts', 'voiceReport.test.ts']),
    ('AI assistant figure check', ['verify.test.ts']),
    ('QR attendance tokens', ['token.test.ts']),
    ('Notification rules', ['rules.test.ts']),
]
# Files with the same name in different folders (mpesa.test.ts) are summed by name.
counts = {}
for t in run['testResults']:
    counts.setdefault(re.split(r'[\\/]', t['name'])[-1], 0)
    counts[re.split(r'[\\/]', t['name'])[-1]] += len(t['assertionResults'])
grouped = [(label, sum(counts.get(f, 0) for f in files)) for label, files in GROUPS]
covered = {f for _, files in GROUPS for f in files}
assert covered >= set(counts), set(counts) - covered
assert sum(v for _, v in grouped) == run['numTotalTests']
pie(f'{OUT}/fig7-1-unit-tests.png', f'Unit tests by area (n = {run["numTotalTests"]}, {len(run["testResults"])} test files)',
    [g[0] for g in grouped], [g[1] for g in grouped])

# ---------------------------------------------------------------- tables by area
AREAS = [('Communication', 8), ('Learning', 7), ('Tenancy and identity', 6), ('Finance', 6),
         ('Subscription', 5), ('Recitation', 4), ('Access control', 3), ('Operations', 2), ('Attendance', 1)]
assert sum(n for _, n in AREAS) == 42
pie(f'{OUT}/fig5-9-tables.png', 'Database tables by functional area (n = 42)',
    [a for a, _ in AREAS], [n for _, n in AREAS])

# ---------------------------------------------------------------- component diagram
fig, ax = canvas(10.2, 6.6)
ax.add_patch(FancyBboxPatch((1, 4), 40, 92, boxstyle='round,pad=0,rounding_size=1', lw=1.2, ec=LINE, fc='white'))
ax.text(21, 93.5, '«subsystem» App (React Native + Expo)', ha='center', fontsize=8, fontweight='bold')
ax.add_patch(FancyBboxPatch((47, 4), 32, 92, boxstyle='round,pad=0,rounding_size=1', lw=1.2, ec=LINE, fc='white'))
ax.text(63, 93.5, '«subsystem» Supabase backend', ha='center', fontsize=8, fontweight='bold')
ui = [('Owner UI', 'admission, classes, fees,\nimpact'), ('Teacher UI', 'attendance, reviews,\nreading room, videos'),
      ('Parent UI', 'child view, M-Pesa,\nmessages, receipts'), ('Student UI', 'recite, hifz plan,\nbadges, videos')]
for k, (name, sub) in enumerate(ui):
    x, y = 11 + (k % 2) * 20, 80 - (k // 2) * 17
    box(ax, x, y, 17, 13, f'«component»\n{name}\n{sub}', fill=ACCENT_FILL, fs=6.6)
box(ax, 11, 45, 17, 12, '«component»\nLocalisation\nEN · SW · SO · AR (RTL)', fill=FILL, fs=6.6)
box(ax, 31, 45, 17, 12, '«component»\nOffline outbox\nqueued registers,\ncached screens', fill=FILL, fs=6.6)
box(ax, 21, 20, 34, 15, '«component»\nAPI client\nsupabase-js · TanStack Query · Zod validation\nAdmin console (web build only)', fill=BLUE_FILL, fs=6.8)
for x in (11, 31):
    for y in (80, 63):
        arrow(ax, (x, y - 6.5), (21, 27.5), dashed=True)
back = [('Authentication', 'e-mail + password,\nJWT sessions', 84), ('PostgreSQL database', '42 tables, Row Level Security\nforced, 89 policies', 67),
        ('Storage', 'private recitation audio,\nsigned links', 50), ('Realtime', 'private reading-room\nchannels', 35),
        ('Edge Functions (18)', 'invoicing, M-Pesa, QR attendance,\nAI feedback, notifications, USSD', 17)]
for name, sub, y in back:
    box(ax, 63, y, 28, 12, f'«component»\n{name}\n{sub}', fill=GREEN_FILL, fs=6.6)
    arrow(ax, (38, 20), (49, y), dashed=True)
ext = [('Safaricom Daraja', 'M-Pesa STK push\n(sandbox)', 84), ('Google Gemini', 'tajweed feedback,\nassistant, voice', 66),
       ('Messaging', 'e-mail, SMS,\nExpo push', 48), ('Africa’s Talking', 'USSD gateway', 31)]
for name, sub, y in ext:
    box(ax, 90, y, 16, 11, f'«external»\n{name}\n{sub}', fill=RED_FILL, fs=6.3)
arrow(ax, (77, 17), (82, 84), dashed=True)
arrow(ax, (77, 17), (82, 66), dashed=True)
arrow(ax, (77, 17), (82, 48), dashed=True)
arrow(ax, (77, 17), (82, 31), dashed=True)
save(fig, f'{OUT}/fig5-3-component.png')

# ---------------------------------------------------------------- deployment diagram
fig, ax = canvas(10.2, 6.2)
box(ax, 15, 80, 26, 20, '«device» Android phone\nILMORA APK (EAS Build)\nReact Native, Expo SDK 54\nkeychain session, offline outbox', fill=ACCENT_FILL, fs=7)
box(ax, 15, 50, 26, 18, '«device» Web browser\nILMORA web build (EAS Hosting)\nplatform admin console', fill=ACCENT_FILL, fs=7)
box(ax, 15, 22, 26, 15, '«device» Basic phone\nUSSD menu via\nAfrica’s Talking', fill=ACCENT_FILL, fs=7)
box(ax, 50, 52, 30, 64, '«cloud» Supabase project\n\nAuth\nPostgreSQL: 42 tables,\n41 migrations, RLS forced\nStorage (private audio)\nRealtime (reading room)\n18 Edge Functions (Deno)\nscheduled jobs', fill=BLUE_FILL, fs=7.4)
box(ax, 86, 78, 24, 30, '«external»\nSafaricom Daraja (M-Pesa,\nsandbox)\nGoogle Gemini\nE-mail · SMS · Expo push\nYouTube · Google Meet / Zoom', fill=GREEN_FILL, fs=6.9)
box(ax, 86, 30, 24, 22, '«repository» GitHub\nsource and migrations\nCI checks on every push\nbackup every three days', fill=FILL, fs=6.9)
arrow(ax, (28, 80), (35, 68), text='HTTPS', style='<|-|>')
arrow(ax, (28, 50), (35, 52), text='HTTPS', style='<|-|>')
arrow(ax, (28, 22), (35, 32), text='USSD callback', style='<|-|>')
arrow(ax, (65, 70), (74, 78), text='HTTPS API', style='<|-|>')
arrow(ax, (74, 30), (65, 40), text='deploy, backup', dashed=True)
save(fig, f'{OUT}/fig7-2-deployment.png')
