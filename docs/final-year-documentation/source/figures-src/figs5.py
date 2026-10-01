"""Figures for the final report: Agile cycle (3.1), architecture (5.1), Gantt (B.1).
usage: python figs5.py <outdir>"""
import sys, os
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diag import *
import numpy as np
import matplotlib.dates as mdates
from matplotlib.patches import Rectangle

OUT = sys.argv[1]

# ------------------------------------------------------------ Figure 3.1 Agile
fig, ax = canvas(8.4, 6.6)
cx, cy, r = 50, 50, 37
phases = ['Requirements\nGathering', 'System\nAnalysis', 'System\nDesign', 'Development',
          'Testing', 'Deployment', 'Review &\nMaintenance']
n = len(phases)
pts = []
for i, label in enumerate(phases):
    a = np.radians(90 - i * 360 / n)
    x, y = cx + r * np.cos(a), cy + r * np.sin(a) * 0.86
    pts.append((x, y))
    box(ax, x, y, 21, 10, f'3.4.{i + 1}\n{label}', fill=ACCENT_FILL if i == 0 else FILL,
        fs=7.8, bold=True)
BW, BH = 21 / 2 + 1.2, 10 / 2 + 1.2          # half box size plus a gap


def on_ring(deg):
    t = np.radians(deg)
    return cx + r * np.cos(t), cy + r * np.sin(t) * 0.86


def inside(pt, centre):
    return abs(pt[0] - centre[0]) < BW and abs(pt[1] - centre[1]) < BH


for i in range(n):
    a0 = 90 - i * 360 / n
    a1 = a0 - 360 / n
    degs = np.linspace(a0, a1, 400)
    ring = [on_ring(d) for d in degs]
    seg = [pt for pt in ring if not inside(pt, pts[i]) and not inside(pt, pts[(i + 1) % n])]
    xs, ys = zip(*seg)
    ax.plot(xs[:-3], ys[:-3], color=ACCENT, lw=1.4, zorder=1)
    ax.add_patch(FancyArrowPatch(seg[-6], seg[-1], arrowstyle='-|>', mutation_scale=14,
                                 lw=1.4, color=ACCENT, zorder=1, shrinkA=0, shrinkB=0))
box(ax, cx, cy, 30, 16,
    'Iterative increments\nPrioritised backlog\nWorking build after\neach iteration',
    fill='white', fs=7.6)
save(fig, f'{OUT}/fig3-1-agile.png')

# ----------------------------------------------------- Figure 5.1 Architecture
fig, ax = canvas(9.0, 10.6)


def tier(y0, h, label):
    ax.add_patch(FancyBboxPatch((3, y0), 94, h, boxstyle='round,pad=0,rounding_size=1',
                                lw=1.0, edgecolor='#c9c2b4', facecolor='#fcfaf5', zorder=0))
    ax.text(5, y0 + h - 1.6, label, fontsize=7.6, fontweight='bold', color=MUTED, va='top')


tier(88, 10.5, '1  USERS  —  Android smartphone (tested on emulator)')
for lbl, x in [('Owner', 12), ('Teacher', 27), ('Parent', 42), ('Student', 57)]:
    box(ax, x, 92, 12.5, 5.6, lbl, fs=7.4)
box(ax, 81, 92, 27, 5.6, 'Platform admin: no mobile UI;\ncalls the lifecycle Edge Function', fs=6.6,
    fill='white')

tier(66, 19.5, '2  MOBILE APPLICATION  —  Expo SDK 54 · React Native 0.81 · TypeScript')
box(ax, 26, 78.5, 40, 5.2, 'Expo Router route groups: (auth),\n(teacher) for owner + teacher, (parent), (student)', fs=7.0)
box(ax, 72, 78.5, 40, 5.2, 'TanStack Query (persisted cache) · Zustand\ni18next: en / sw / so / ar (RTL)', fs=7.0)
box(ax, 26, 70.8, 40, 5.2, 'Camera QR scanner · audio recorder', fs=7.0)
box(ax, 72, 70.8, 40, 5.2, 'API layer: supabase-js client\n(mock mode for offline development)', fs=7.0,
    fill=ACCENT_FILL)

tier(33, 30, '3  SUPABASE (managed)  —  authentication, application logic and data')
box(ax, 17, 55, 22, 6.6, 'Auth (GoTrue)\nJWT sessions', fill=BLUE_FILL, fs=7.2)
box(ax, 40.5, 55, 22, 6.6, 'PostgREST\nauto REST API', fill=BLUE_FILL, fs=7.2)
box(ax, 64, 55, 22, 6.6, 'Edge Functions (Deno)\n9 deployed', fill=BLUE_FILL, fs=7.2)
box(ax, 86, 55, 17, 6.6, 'Storage\n3 private buckets', fill=BLUE_FILL, fs=7.2)
box(ax, 50, 42.5, 86, 7.4,
    'PostgreSQL 17  ·  38 tables  ·  RLS enabled and FORCED on all 38  ·  81 table policies\n'
    'SECURITY DEFINER helpers: current_madrasa_id(), can_access_madrasa(), can_read_student()',
    fill=GREEN_FILL, fs=7.2, bold=False)
for x in (17, 40.5, 64, 86):
    arrow(ax, (x, 51.6), (x if x != 86 else 80, 46.3))
ax.text(50, 35.2, 'Every client request carries the user JWT; the service-role key exists only inside Edge Functions',
        ha='center', fontsize=6.8, color=MUTED, style='italic')

tier(3, 27, '4  OTHER SERVICES')
box(ax, 24, 20.5, 38, 8.2, 'AI gateway (Node.js, :8787)\nruns on a local machine / LAN\nverifies JWT, reads RLS-scoped records',
    fill=RED_FILL, fs=7.0)
box(ax, 24, 9.2, 38, 6.6, 'Ollama — qwen3:1.7b (local model)\nnumeric-verification guard', fill=RED_FILL, fs=7.0)
box(ax, 72, 20.5, 40, 8.2, 'GitHub Actions\nCI: secret scan · build config · typecheck\nBackup & keep-alive every 3 days',
    fill=FILL, fs=7.0)
box(ax, 72, 9.2, 40, 6.6, 'EAS Build (Expo)\ndevelopment / preview / production profiles', fill=FILL, fs=7.0)
arrow(ax, (24, 16.3), (24, 12.6))

# vertical flows between tiers
arrow(ax, (35, 88), (35, 81.2))
arrow(ax, (50, 68.2), (50, 58.4), 'HTTPS · JWT bearer token', offset=(0, 0.6))
# AI traffic goes app -> gateway directly over the LAN, routed outside the tiers
ax.plot([3, 0.8, 0.8], [75, 75, 20.5], color=LINE, lw=1.0, zorder=1)
arrow(ax, (0.8, 20.5), (5, 20.5))
ax.text(0.2, 47, 'AI questions over HTTP (LAN)', rotation=90, ha='center', va='center',
        fontsize=6.8, color=MUTED, bbox=dict(boxstyle='round,pad=0.2', fc='white', ec='none'))
arrow(ax, (24, 24.7), (24, 32.8), 'user JWT → Auth / PostgREST', dashed=True, offset=(9.5, 0.3))
save(fig, f'{OUT}/fig5-1-architecture.png')

# --------------------------------------------------------- Figure B.1 Gantt
# Part A: the proposal's planned 16-week schedule (relative weeks, no dates).
# Part B: dated implementation evidence from the git history.
plan = [
    ('Requirements gathering', 1, 2), ('Literature review', 2, 4), ('System design', 3, 6),
    ('Backend & authentication', 5, 8), ('AI module integration', 8, 10),
    ('Frontend development', 10, 12), ('Testing', 12, 14), ('Documentation & submission', 14, 16),
]
fig, ax = plt.subplots(figsize=(8.6, 3.6))
for i, (task, a, b) in enumerate(plan):
    ax.barh(i, b - a + 1, left=a - 0.5, height=0.55, color=ACCENT, edgecolor=LINE, lw=0.6)
ax.set_yticks(range(len(plan)))
ax.set_yticklabels([t for t, _, _ in plan], fontsize=8)
ax.invert_yaxis()
ax.set_xticks(range(1, 17))
ax.set_xlim(0.5, 16.5)
ax.set_xlabel('Project week (as planned in the proposal, August 2026)', fontsize=8)
ax.tick_params(axis='x', labelsize=7.5)
ax.grid(axis='x', color='#e3ded3', lw=0.6)
ax.set_axisbelow(True)
for s in ('top', 'right'):
    ax.spines[s].set_visible(False)
fig.tight_layout()
fig.savefig(f'{OUT}/figB-1-gantt-planned.png', dpi=200, facecolor='white')
plt.close(fig)
print(f'  wrote {OUT}/figB-1-gantt-planned.png')

# Dated evidence: each bar spans the first to last commit of that stream of work.
commits = [
    ('Initial platform: schema, RLS, screens', date(2026, 8, 23), date(2026, 8, 23)),
    ('Edge Functions, CI, backups, EAS config', date(2026, 9, 16), date(2026, 9, 16)),
    ('Backend connection & core workflows', date(2026, 9, 19), date(2026, 9, 19)),
    ('Recitation storage & teacher review', date(2026, 9, 19), date(2026, 9, 23)),
    ('Parent visibility & dashboard fixes', date(2026, 9, 23), date(2026, 9, 23)),
    ('Student QR attendance', date(2026, 9, 23), date(2026, 9, 23)),
    ('Invoice targeting', date(2026, 9, 24), date(2026, 9, 24)),
    ('Documentation & report', date(2026, 9, 24), date(2026, 9, 26)),
]
fig, ax = plt.subplots(figsize=(8.6, 3.6))
for i, (task, a, b) in enumerate(commits):
    start = mdates.date2num(a)
    width = max(mdates.date2num(b) - start + 1, 1)
    ax.barh(i, width, left=start, height=0.55, color='#5b7fa6', edgecolor=LINE, lw=0.6)
ax.set_yticks(range(len(commits)))
ax.set_yticklabels([t for t, _, _ in commits], fontsize=8)
ax.invert_yaxis()
ax.xaxis_date()
ax.xaxis.set_major_locator(mdates.DayLocator(interval=3))
ax.xaxis.set_major_formatter(mdates.DateFormatter('%d %b'))
ax.set_xlim(mdates.date2num(date(2026, 8, 21)), mdates.date2num(date(2026, 9, 28)))
ax.tick_params(axis='x', labelsize=7.2, rotation=0)
ax.set_xlabel('Calendar date, 2026 (from repository commit timestamps)', fontsize=8)
ax.grid(axis='x', color='#e3ded3', lw=0.6)
ax.set_axisbelow(True)
for s in ('top', 'right'):
    ax.spines[s].set_visible(False)
fig.tight_layout()
fig.savefig(f'{OUT}/figB-2-gantt-actual.png', dpi=200, facecolor='white')
plt.close(fig)
print(f'  wrote {OUT}/figB-2-gantt-actual.png')
