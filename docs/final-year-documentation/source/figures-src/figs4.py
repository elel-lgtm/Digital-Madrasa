"""Database schema map and interface wireframes."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diag import *

OUT = sys.argv[1]

# ------------------------------------------------ Database schema overview
fig, ax = canvas(9.2, 7.8)
title(ax, 'Database Schema Overview — 40 Tables by Functional Area')

groups = [
    ('TENANCY AND IDENTITY', 5, 90, 27, ACCENT_FILL,
     ['madrasas', 'profiles', 'teachers', 'students', 'parents', 'enrollments']),
    ('ACCESS CONTROL', 36, 90, 27, RED_FILL,
     ['parent_student_links', 'feature_flags', 'audit_log']),
    ('LEARNING', 67, 90, 28, BLUE_FILL,
     ['classes', 'lessons', 'assignments', 'submissions', 'grades', 'hifz_progress']),
    ('ATTENDANCE', 5, 60, 27, GREEN_FILL, ['attendance']),
    ('RECITATION', 36, 60, 27, GREEN_FILL,
     ['recitations', 'tajweed_feedback', 'certificates']),
    ('FINANCE', 67, 60, 28, FILL,
     ['fee_structures', 'invoices', 'invoice_counters', 'payments',
      'payment_allocations', 'receipts']),
    ('SUBSCRIPTION', 5, 31, 27, FILL,
     ['subscriptions', 'subscription_plans', 'subscription_invoices',
      'subscription_payments', 'saved_cards']),
    ('COMMUNICATION', 36, 31, 27, BLUE_FILL,
     ['announcements', 'message_threads', 'messages', 'notifications',
      'notification_preferences', 'mail_outbox', 'sms_outbox', 'push_tokens']),
    ('OPERATIONS', 67, 31, 28, FILL,
     ['admission_counters', 'rate_limits']),
]

for label, x, ytop, w, fill, tables in groups:
    h = 7 + len(tables) * 3.1
    ax.add_patch(FancyBboxPatch((x, ytop - h + 4), w, h,
                 boxstyle='round,pad=0,rounding_size=0.9', lw=1.1,
                 edgecolor=LINE, facecolor=fill, zorder=1))
    ax.text(x + w / 2, ytop + 1.0, label, ha='center', va='center',
            fontsize=7.0, fontweight='bold', color=INK)
    for i, t in enumerate(tables):
        ax.text(x + 1.8, ytop - 2.6 - i * 3.1, f'•  {t}', ha='left', va='center',
                fontsize=6.4, color=INK)

ax.text(50, -1.5,
        'Every tenant-owned table carries madrasa_id.  Row Level Security is ENABLED and '
        'FORCED on all 40 tables, governed by 84 policies.',
        ha='center', fontsize=7.0, color=MUTED, style='italic')
save(fig, f'{OUT}/fig5-11-schema.png')

# ---------------------------------------------------------------- Wireframes
fig, ax = canvas(9.2, 5.2)
title(ax, 'Interface Wireframes — Representative Screens')


def phone(x, y, w, h, name, rows):
    """A simple device frame with stacked content blocks."""
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                 boxstyle='round,pad=0,rounding_size=1.6', lw=1.4,
                 edgecolor=INK, facecolor='white', zorder=2))
    # status bar and title
    ax.add_patch(FancyBboxPatch((x - w / 2 + 1.2, y + h / 2 - 5.4), w - 2.4, 3.0,
                 boxstyle='round,pad=0,rounding_size=0.4', lw=0,
                 facecolor='#e9e4d8', zorder=3))
    top = y + h / 2 - 8.5
    for label, kind in rows:
        if kind == 'head':
            ax.text(x - w / 2 + 2.2, top, label, ha='left', va='center',
                    fontsize=6.6, fontweight='bold', color=INK, zorder=4)
            top -= 4.0
        elif kind == 'card':
            ax.add_patch(FancyBboxPatch((x - w / 2 + 2.0, top - 3.2), w - 4.0, 4.4,
                         boxstyle='round,pad=0,rounding_size=0.5', lw=0.9,
                         edgecolor='#bdb6a6', facecolor='#faf8f3', zorder=3))
            ax.text(x - w / 2 + 3.0, top - 1.0, label, ha='left', va='center',
                    fontsize=5.8, color=MUTED, zorder=4)
            top -= 6.0
        elif kind == 'btn':
            ax.add_patch(FancyBboxPatch((x - w / 2 + 2.0, top - 3.0), w - 4.0, 4.0,
                         boxstyle='round,pad=0,rounding_size=1.4', lw=0,
                         facecolor=ACCENT, zorder=3))
            ax.text(x, top - 1.0, label, ha='center', va='center',
                    fontsize=5.8, fontweight='bold', color='white', zorder=4)
            top -= 6.0
    # tab bar
    ax.add_patch(FancyBboxPatch((x - w / 2 + 1.2, y - h / 2 + 1.4), w - 2.4, 3.4,
                 boxstyle='round,pad=0,rounding_size=0.4', lw=0,
                 facecolor='#efeae0', zorder=3))
    ax.text(x, y - h / 2 - 2.6, name, ha='center', va='center',
            fontsize=7.2, fontweight='bold', color=INK)


phone(13, 52, 20, 70, 'Sign in', [
    ('DIGITAL MADRASA', 'head'), ('Email address', 'card'),
    ('Password', 'card'), ('Sign in', 'btn'), ('Forgot password', 'card')])

phone(37, 52, 20, 70, 'Teacher dashboard', [
    ('Assalamu alaikum', 'head'), ('Students   Attendance', 'card'),
    ('Fees collected / due', 'card'), ('Today’s classes', 'card'),
    ('Work queue', 'card')])

phone(61, 52, 20, 70, 'QR attendance', [
    ('Scan attendance', 'head'), ('Camera preview', 'card'),
    ('  (scan frame)', 'card'), ('Hold code in square', 'card'),
    ('Scan again', 'btn')])

phone(85, 52, 20, 70, 'Issue invoices', [
    ('Review billing run', 'head'), ('Target: one class', 'card'),
    ('Eligible / already billed', 'card'), ('Amount and total', 'card'),
    ('Confirm issue', 'btn')])

save(fig, f'{OUT}/fig5-12-wireframes.png')
