"""Version 3 figures: the finished system.

  5.1  architecture (payments, notification delivery, admin console)
  5.x  sequence: M-Pesa fee payment      5.x  flow: notification delivery
  7.x  charts from measured data: test assets, API latency, RLS fix, translation coverage
  8.1  requirement status (the same list as Table 4.5)

Every number drawn here was measured on 30 September 2026 (npm run perf:api,
npm run perf:db, npm run check:i18n, the test runners) and is recorded below.

usage: python figs7.py <diagrams-out> <charts-out>
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diag import *
import numpy as np
import matplotlib.pyplot as plt

DIA, CH = sys.argv[1], sys.argv[2]
plt.rcParams['font.family'] = 'DejaVu Sans'

# ------------------------------------------------------------ 5.1 architecture
fig, ax = canvas(9.0, 11.6)


def tier(y0, h, label):
    ax.add_patch(FancyBboxPatch((3, y0), 94, h, boxstyle='round,pad=0,rounding_size=1',
                                lw=1.0, edgecolor='#c9c2b4', facecolor='#fcfaf5', zorder=0))
    ax.text(5, y0 + h - 1.5, label, fontsize=7.4, fontweight='bold', color=MUTED, va='top')


tier(89, 9.8, '1  USERS')
for lbl, x in [('Owner', 11), ('Teacher', 24.5), ('Parent', 38), ('Student', 51.5)]:
    box(ax, x, 92.6, 11.5, 4.6, lbl, fs=7.2)
box(ax, 67, 92.6, 15, 4.6, 'Visitor\n(verify certificate)', fs=6.4, fill='white')
box(ax, 85.5, 92.6, 18, 4.6, 'Platform admin\n(web browser)', fs=6.6, fill=ACCENT_FILL)

tier(68.5, 18.5, '2  CLIENT  —  one Expo SDK 54 · React Native 0.81 · TypeScript codebase')
box(ax, 26, 80, 40, 5.0, 'Android app: route groups (auth), (teacher),\n(parent), (student)', fs=6.8)
box(ax, 72, 80, 40, 5.0, 'Web build: platform admin console (admin)\n(react-native-web)', fs=6.8,
    fill=ACCENT_FILL)
box(ax, 26, 72.8, 40, 5.0, 'TanStack Query · Zustand · i18next en/sw/so/ar (RTL)\n'
    'QR scanner · recorder · offline Quran library', fs=6.4)
box(ax, 72, 72.8, 40, 5.0, 'API seam: Supabase client (mock provider for demos)\n'
    'Expo push-token registration', fs=6.4, fill=ACCENT_FILL)

tier(29, 37, '3  SUPABASE (managed)  —  authentication, application logic and data')
box(ax, 13, 58.5, 15, 6.2, 'Auth (GoTrue)\nJWT sessions', fill=BLUE_FILL, fs=6.8)
box(ax, 30, 58.5, 15, 6.2, 'PostgREST\nREST + RPC', fill=BLUE_FILL, fs=6.8)
box(ax, 55, 58.5, 31, 7.2, 'Edge Functions (Deno) — 12 deployed\npayments · payment-callback ·\n'
    'dispatch-notifications · madrasa-lifecycle · …', fill=BLUE_FILL, fs=6.2)
box(ax, 84, 58.5, 19, 6.2, 'Storage — 4 buckets\n3 private · quran (public)', fill=BLUE_FILL, fs=6.2)
box(ax, 50, 45.5, 86, 8.4,
    'PostgreSQL 17  ·  40 tables  ·  RLS enabled and FORCED on all 40  ·  84 table policies\n'
    'readable_student_ids() / can_read_student() · settle_*_payment() · claim_*() queues\n'
    'mail_outbox · sms_outbox · push_tokens · audit_log (append-only)',
    fill=GREEN_FILL, fs=6.8)
box(ax, 23, 34.4, 34, 4.6, 'pg_cron: sweep every 5 min\npg_net: kick dispatcher on insert', fill='white', fs=6.4)
box(ax, 75, 34.4, 32, 4.6, 'Vault: dispatcher key · project URL\n(never in the client or Git)', fill='white', fs=6.4)
for x0, x1 in ((13, 13), (30, 30), (55, 55), (84, 80)):
    arrow(ax, (x0, 55.0 if x0 != 55 else 54.9), (x1, 49.8))
arrow(ax, (23, 41.2), (23, 36.8))
ax.text(50, 30.4, 'The service-role key exists only inside Edge Functions; money and notices '
        'change state only on the server', ha='center', fontsize=6.4, color=MUTED, style='italic')

tier(3, 23.5, '4  EXTERNAL SERVICES')
box(ax, 17, 17.5, 24, 6.0, 'Safaricom Daraja\nM-Pesa STK Push\n(mock · sandbox · live)', fill=RED_FILL, fs=6.4)
box(ax, 41.5, 17.5, 21, 6.0, 'Expo push service\n(device tokens)', fill=RED_FILL, fs=6.6)
box(ax, 63.5, 17.5, 19, 6.0, 'Resend (e-mail)\nAfrica’s Talking (SMS)\nmock until keyed', fill=RED_FILL, fs=6.2)
box(ax, 85, 17.5, 20, 6.0, 'AI gateway (Node.js)\n+ Ollama qwen3:1.7b\nRLS-scoped reads', fill=RED_FILL, fs=6.2)
box(ax, 30, 7.6, 40, 4.6, 'GitHub — CI: secret scan · build config · typecheck', fill=FILL, fs=6.6)
box(ax, 72, 7.6, 40, 4.6, 'EAS Build (Expo) — Android profiles', fill=FILL, fs=6.6)

arrow(ax, (38, 89), (38, 82.6))
arrow(ax, (85.5, 90.3), (80, 82.6))
arrow(ax, (50, 70.2), (50, 62.2), 'HTTPS · user JWT', offset=(0, 0.5))
# One labelled two-way link between the tiers, in the gap between the two
# bottom-row boxes, instead of lines drawn across the database.
arrow(ax, (47.5, 29.2), (47.5, 21.0), style='<|-|>')
ax.text(49, 25.5, 'Edge Functions ⇄ external services:\nSTK push · Daraja callback (shared key) ·\n'
        'Expo push · e-mail/SMS · AI questions (user JWT)', fontsize=6.0, color=INK, va='center',
        bbox=dict(boxstyle='round,pad=0.25', fc='white', ec='#c9c2b4', lw=0.8))
save(fig, f'{DIA}/fig5-architecture.png')

# ------------------------------------------------ sequence: M-Pesa fee payment
fig, ax = canvas(9.0, 9.6)
lanes = [('Parent\napp', 9), ('payments\n(Edge Function)', 27), ('Safaricom\nDaraja', 46),
         ('payment-callback\n(Edge Function)', 65), ('PostgreSQL\n(settle_fee_payment)', 86)]
for lbl, x in lanes:
    box(ax, x, 94, 17, 7, lbl, fill=ACCENT_FILL, fs=6.6, bold=True)
    ax.plot([x, x], [90.4, 3], color='#b9b2a4', lw=0.9, ls=(0, (3, 3)), zorder=0)
steps = [
    (9, 27, 85, '1  pay-fees (invoice ids, phone) — no amount'),
    (27, 27, 79.5, '2  JWT · parent role · rate limit · RLS read of invoices'),
    (27, 86, 74, '3  insert payment (initiated) + allocations'),
    (27, 46, 68.5, '4  STK push (amount from invoices)'),
    (46, 27, 63, '5  CheckoutRequestID'),
    (27, 9, 57.5, '6  intent: checkout id, masked phone'),
    (46, 46, 52, '7  parent enters PIN on the phone'),
    (46, 65, 46.5, '8  callback ?key=secret (result, receipt, amount)'),
    (65, 86, 41, '9  settle: lock row · amount check · apply_payment'),
    (86, 86, 35.5, '10  receipt RCP-YYYY-NNNNNN · invoice status · notice'),
    (65, 46, 30, '11  200 Accepted (replays ignored)'),
    (9, 27, 24, '12  status poll (every 2 s)'),
    (27, 86, 18.5, '13  read as the parent (RLS); query Daraja if callback is late'),
    (27, 9, 12.5, '14  success + receipt number'),
]
for x1, x2, y, label in steps:
    if x1 == x2:
        ax.add_patch(FancyBboxPatch((x1 - 1.2, y - 1.6), 2.4, 3.2, boxstyle='round,pad=0,rounding_size=0.3',
                                    lw=1.0, edgecolor=LINE, facecolor=ACCENT_FILL, zorder=3))
        ax.text(x1 + 2.5 if x1 < 80 else x1 - 2.5, y, label, ha='left' if x1 < 80 else 'right',
                va='center', fontsize=6.1, color=INK)
    else:
        arrow(ax, (x1, y), (x2, y), dashed=label.startswith(('5', '6', '11', '14')))
        ax.text((x1 + x2) / 2, y + 1.8, label, ha='center', fontsize=6.1, color=INK)
save(fig, f'{DIA}/fig5-seq-payment.png')

# ------------------------------------------------ flow: notification delivery
fig, ax = canvas(9.0, 7.4)
box(ax, 12.5, 88, 23, 7, 'Event\n(invoice, receipt,\nannouncement, message …)', fs=6.4, fill=ACCENT_FILL)
cyl(ax, 38, 88, 18, 9, 'notifications\n(row per recipient)', fs=6.6)
box(ax, 64, 88, 20, 7, 'statement trigger →\npg_net kick', fs=6.6)
box(ax, 88, 88, 18, 7, 'pg_cron sweep\nevery 5 minutes', fs=6.6)
box(ax, 64, 70, 38, 7.5, 'dispatch-notifications\nclaim_notifications()  ·  FOR UPDATE SKIP LOCKED', fs=6.6, fill=BLUE_FILL)
diamond(ax, 64, 53, 30, 11, 'channels = requested ∩\nuser preferences', fs=6.4)
box(ax, 22, 34, 22, 7, 'Push → Expo push service\ndead token → disabled', fs=6.2, fill=RED_FILL)
box(ax, 50, 34, 22, 7, 'E-mail → mail_outbox\n(queued first)', fs=6.2, fill=GREEN_FILL)
box(ax, 78, 34, 22, 7, 'SMS → sms_outbox\n(queued first)', fs=6.2, fill=GREEN_FILL)
box(ax, 64, 14, 40, 8, 'claim_mail() / claim_sms(): send, record provider id,\n'
    'retry with backoff 2 · 4 · 8 · 16 min, then “failed”', fs=6.3, fill=BLUE_FILL)
arrow(ax, (21.5, 88), (29, 88)); arrow(ax, (47, 88), (54, 88))
arrow(ax, (64, 84.5), (64, 73.8)); arrow(ax, (88, 84.5), (72, 73.8))
arrow(ax, (64, 66.2), (64, 58.5))
arrow(ax, (52, 50), (26, 37.6)); arrow(ax, (60, 47.5), (50, 37.6)); arrow(ax, (70, 47.5), (78, 37.6))
arrow(ax, (50, 30.5), (58, 18)); arrow(ax, (78, 30.5), (70, 18))
ax.text(50, 3, 'In-app delivery needs no dispatch: the inbox reads the notifications table directly (RLS: own rows only).',
        ha='center', fontsize=6.4, color=MUTED, style='italic')
save(fig, f'{DIA}/fig5-notify-flow.png')

# ------------------------------------------------------------------ charts
PAL = ['#2f5d8a', '#d9b23a', '#6a9a5b', '#b5563f', '#8c7aa9', '#7f7f7f']


def pie(name, labels, values, note):
    fig, ax = plt.subplots(figsize=(6.4, 4.2))
    wedges, _, autot = ax.pie(values, colors=PAL[:len(values)], startangle=90, counterclock=False,
                              autopct=lambda p: f'{p:.0f}%' if p >= 4 else '', pctdistance=0.72,
                              wedgeprops=dict(edgecolor='white', linewidth=1.6))
    for t in autot:
        t.set_color('white'); t.set_fontsize(8.5); t.set_fontweight('bold')
    ax.legend(wedges, labels, loc='center left', bbox_to_anchor=(1.0, 0.5), frameon=False, fontsize=8.6)
    ax.set_aspect('equal')
    ax.text(0.5, -0.06, note, transform=ax.transAxes, ha='center', va='top', fontsize=7.2,
            color=MUTED, style='italic')
    fig.savefig(f'{CH}/{name}.png', dpi=200, bbox_inches='tight', facecolor='white', pad_inches=0.2)
    plt.close(fig)
    print(f'  wrote {name}.png')


# Test assets by layer (files in the repository, counted 30 Sep 2026)
pie('fig7-test-layers',
    ['Unit test files — 74 tests (8)', 'SQL verification suites (10)', 'End-to-end API scripts (11)',
     'Web UI walkthroughs (3)', 'Performance scripts (2)'],
    [8, 10, 11, 3, 2],
    'Source: repository — packages/, services/, supabase/functions/**/*.test.ts, supabase/tests, scripts')

# User interface verification items — Table 7.10
pie('fig7-verification',
    ['Verified (19)', 'Failed, fixed and re-verified (1)', 'Not verified — needs a phone or native build (7)'],
    [19, 1, 7],
    'Source: Table 7.10 — 27 Android user interface verification items')

# Requirement status — the same classification as Table 4.5
pie('fig8-status',
    ['Implemented and verified (25)', 'Built, awaiting device test (2)', 'Partial (2)'],
    [25, 2, 2],
    'Source: Table 4.5 — 29 functional requirements')


def hbar(name, labels, series, legend, xlabel, note, log=False, fmt='{:.0f}', w=6.6, h=4.4, budget=None):
    fig, ax = plt.subplots(figsize=(w, h))
    y = np.arange(len(labels))[::-1]
    n = len(series)
    hgt = 0.8 / n
    for i, (vals, lab) in enumerate(zip(series, legend)):
        yy = y + (n - 1) / 2 * hgt - i * hgt
        bars = ax.barh(yy, vals, height=hgt * 0.92, color=PAL[i], label=lab)
        for b, v in zip(bars, vals):
            ax.text(b.get_width() * (1.08 if log else 1) + (0 if log else max(max(s) for s in series) * 0.01),
                    b.get_y() + b.get_height() / 2, fmt.format(v), va='center', fontsize=7, color=INK)
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=8)
    if log:
        ax.set_xscale('log')
    if budget:
        ax.axvline(budget, color='#b5563f', lw=1, ls='--')
        ax.text(budget, len(labels) - 0.35, f' budget {budget} ms', color='#b5563f', fontsize=7)
    ax.set_xlabel(xlabel, fontsize=8)
    ax.tick_params(axis='x', labelsize=7.5)
    ax.spines[['top', 'right']].set_visible(False)
    ax.legend(fontsize=7.6, frameon=False, loc='upper center', bbox_to_anchor=(0.45, -0.13), ncol=2)
    fig.text(0.5, -0.1, note, ha='center', fontsize=7.0, color=MUTED, style='italic')
    fig.savefig(f'{CH}/{name}.png', dpi=200, bbox_inches='tight', facecolor='white', pad_inches=0.2)
    plt.close(fig)
    print(f'  wrote {name}.png')


# npm run perf:api — 30 requests per operation, 5 concurrent, round trip from Kenya
api = [('Owner: students + profiles', 226, 652), ('Owner: open invoices', 276, 302),
       ('Owner: today’s attendance', 221, 618), ('Owner: subscription', 222, 250),
       ('Edge: attendance-qr token', 578, 742), ('Parent: children’s invoices', 228, 321),
       ('Parent: inbox', 268, 308), ('Parent: payments + receipts', 228, 680),
       ('Student: memorisation', 222, 256), ('Student: assignments', 226, 289),
       ('Public: verify certificate', 221, 583), ('Edge: health', 449, 533)]
hbar('fig7-latency', [a for a, _, _ in api], [[b for _, b, _ in api], [c for _, _, c in api]],
     ['p50', 'p95'], 'milliseconds (round trip)',
     'Source: npm run perf:api — 30 requests per operation, 5 concurrent; budget p95 1500 ms (REST), 3000 ms (Edge)',
     h=5.2)

# npm run perf:db — server execution time, median of 5, before and after migration 0027
rls = [('Student: own attendance', 25.77, 0.21), ('Student: own memorisation', 14.95, 0.21),
       ('Parent: children’s memorisation', 27.69, 0.35), ('Parent: attendance, 30 days', 9.97, 0.33),
       ('Parent: children’s invoices', 2.99, 0.28), ('Owner: students with names', 3.50, 1.09)]
hbar('fig7-rls', [a for a, _, _ in rls], [[b for _, b, _ in rls], [c for _, _, c in rls]],
     ['before (per-row can_read_student)', 'after (readable_student_ids)'],
     'milliseconds, log scale (server execution time)',
     'Source: npm run perf:db on the seeded school; at 2,000 pupils the parent attendance query '
     'went from a statement timeout to 7.1 ms', log=True, fmt='{:.2f}', h=4.0)

# npm run check:i18n — keys translated out of 782, before and after this iteration
fig, ax = plt.subplots(figsize=(6.2, 3.2))
langs = ['English', 'Kiswahili', 'Somali', 'Arabic']
before = [100, 51, 50, 50]
after = [100, 100, 100, 100]
x = np.arange(len(langs))
b1 = ax.bar(x - 0.19, before, 0.36, color=PAL[1], label='before (29 Sep)')
b2 = ax.bar(x + 0.19, after, 0.36, color=PAL[0], label='after (30 Sep)')
for bars in (b1, b2):
    for b in bars:
        ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 1.5, f'{b.get_height():.0f}%',
                ha='center', fontsize=7.5)
ax.set_xticks(x); ax.set_xticklabels(langs, fontsize=8.5)
ax.set_ylim(0, 115); ax.set_ylabel('keys translated (%)', fontsize=8)
ax.spines[['top', 'right']].set_visible(False)
ax.legend(fontsize=7.6, frameon=False, loc='lower right')
fig.text(0.5, -0.02, 'Source: npm run check:i18n — 782 keys; Arabic also carries all six CLDR plural forms',
         ha='center', fontsize=7.0, color=MUTED, style='italic')
fig.savefig(f'{CH}/fig7-4-locales.png', dpi=200, bbox_inches='tight', facecolor='white', pad_inches=0.2)
plt.close(fig)
print('  wrote fig7-4-locales.png')
