"""Figures: Agile (3.1), conceptual framework (2.1), architecture (5.1)."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diag import *
import numpy as np

OUT = sys.argv[1]

# ---------------------------------------------------------------- Figure 3.1
fig, ax = canvas(8.4, 6.0)
title(ax, 'Agile (Scrum) Development Cycle as Applied to Digital Madrasa')

cx, cy, r = 50, 52, 26
stages = [
    ('Requirements\n& Sprint Planning', 90),
    ('Design', 38),
    ('Development', -14),
    ('Testing &\nVerification', -66),
    ('Deployment', -118),
    ('Review &\nRetrospective', 150),
]
pts = []
for label, deg in stages:
    a = np.radians(deg)
    x, y = cx + r * np.cos(a), cy + r * np.sin(a) * 0.82
    pts.append((x, y))
    box(ax, x, y, 23, 10, label, fill=ACCENT_FILL if 'Sprint' in label else FILL,
        fs=7.6, bold=True)

for i in range(len(pts)):
    p, q = pts[i], pts[(i + 1) % len(pts)]
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle='-|>', mutation_scale=12,
                                 lw=1.2, color=ACCENT, zorder=1,
                                 connectionstyle='arc3,rad=0.18',
                                 shrinkA=15, shrinkB=15))

box(ax, cx, cy, 26, 13, 'Two-week sprint\nProduct backlog\nreviewed with\nsupervisor',
    fill='white', fs=7.2, bold=False)
ax.text(50, 9, 'Eighteen commits across six sprints, 23 August – 24 September 2026',
        ha='center', fontsize=7.4, color=MUTED, style='italic')
save(fig, f'{OUT}/fig3-1-agile.png')

# ---------------------------------------------------------------- Figure 2.1
fig, ax = canvas(8.4, 5.4)
title(ax, 'Conceptual Framework of the Digital Madrasa')

ax.text(16, 88, 'INDEPENDENT VARIABLES', ha='center', fontsize=7.6,
        fontweight='bold', color=MUTED)
ax.text(50, 88, 'MEDIATING PLATFORM', ha='center', fontsize=7.6,
        fontweight='bold', color=MUTED)
ax.text(85, 88, 'DEPENDENT VARIABLE', ha='center', fontsize=7.6,
        fontweight='bold', color=MUTED)

box(ax, 16, 74, 26, 9, 'Recitation audio\nsubmitted by student', fs=7.4)
box(ax, 16, 60, 26, 9, 'Lessons and assignments\nset by teacher', fs=7.4)
box(ax, 16, 46, 26, 9, 'Attendance and\nengagement frequency', fs=7.4)
box(ax, 16, 32, 26, 9, 'Parental supervision\nand follow-up', fs=7.4)

box(ax, 50, 62, 26, 14, 'DIGITAL MADRASA\nPLATFORM\n(multi-tenant, role-based)',
    fill=ACCENT_FILL, fs=8, bold=True)
box(ax, 50, 42, 26, 11, 'Recitation evaluation\nand teacher review',
    fill='white', fs=7.4)
box(ax, 50, 26, 26, 9, 'Shared progress record', fill='white', fs=7.4)

box(ax, 85, 52, 24, 14, 'Improved Quran\nmemorisation accuracy,\nconsistency and\ninstitutional oversight',
    fill=GREEN_FILL, fs=7.4, bold=True)

for yy in (74, 60, 46, 32):
    arrow(ax, (29.2, yy), (36.8, 62 if yy > 50 else 42))
arrow(ax, (50, 55), (50, 47.6))
arrow(ax, (50, 36.4), (50, 30.6))
arrow(ax, (63.2, 52), (72.8, 52))
arrow(ax, (50, 21.4), (85, 21.4), rad=-0.12)
arrow(ax, (85, 21.4), (85, 44.8))
ax.text(67, 18.4, 'feedback loop: progress visible to teacher and parent',
        ha='center', fontsize=6.8, color=MUTED, style='italic')
save(fig, f'{OUT}/fig2-1-conceptual.png')

# ---------------------------------------------------------------- Figure 5.1
fig, ax = canvas(8.4, 6.4)
title(ax, 'Digital Madrasa System Architecture')

ax.add_patch(FancyBboxPatch((6, 68), 88, 20, boxstyle='round,pad=0,rounding_size=1',
             lw=1.0, edgecolor='#c9c2b4', facecolor='#fcfaf5', zorder=0))
ax.text(9, 85.5, 'PRESENTATION TIER  —  Expo / React Native 0.81 (Android)',
        fontsize=7.4, fontweight='bold', color=MUTED)
for i, (lbl, x) in enumerate([('Owner', 17), ('Teacher', 33), ('Parent', 49),
                              ('Student', 65), ('Platform\nAdmin', 82)]):
    box(ax, x, 75, 14, 9, f'{lbl}\ndashboard', fs=7.2)

box(ax, 50, 58, 74, 8, 'Expo Router  ·  TanStack Query (cached)  ·  i18next (en / sw / so / ar)  ·  Zustand',
    fill=ACCENT_FILL, fs=7.4)

arrow(ax, (50, 67.8), (50, 62.2))
arrow(ax, (50, 53.8), (50, 47.2), 'HTTPS  ·  JWT bearer token', offset=(0, 0.2))

ax.add_patch(FancyBboxPatch((6, 12), 88, 32, boxstyle='round,pad=0,rounding_size=1',
             lw=1.0, edgecolor='#c9c2b4', facecolor='#fcfaf5', zorder=0))
ax.text(9, 41.5, 'APPLICATION AND DATA TIER  —  Supabase (managed PostgreSQL 17)',
        fontsize=7.4, fontweight='bold', color=MUTED)

box(ax, 20, 33, 22, 8, 'Supabase Auth\n(GoTrue, JWT)', fill=BLUE_FILL, fs=7.2)
box(ax, 50, 33, 30, 8, 'Edge Functions (Deno)\n8 deployed', fill=BLUE_FILL, fs=7.2)
box(ax, 80, 33, 20, 8, 'Supabase Storage\nprivate bucket', fill=BLUE_FILL, fs=7.2)

box(ax, 50, 21, 74, 7.5,
    'PostgreSQL  ·  38 tables  ·  Row Level Security FORCED on 38  ·  81 policies',
    fill=GREEN_FILL, fs=7.4, bold=True)

arrow(ax, (20, 29), (32, 24.8))
arrow(ax, (50, 29), (50, 24.8))
arrow(ax, (80, 29), (68, 24.8))
ax.text(50, 14.5, 'Every client query is narrowed by RLS; the service-role key never leaves the server',
        ha='center', fontsize=6.9, color=MUTED, style='italic')
save(fig, f'{OUT}/fig5-1-architecture.png')
