"""Charts for the Digital Madrasa report.

Two kinds are produced here and they are deliberately distinguishable:

  * Charts built from data that actually exists — the live database, the
    verification results, the measured translation coverage. These carry a
    source line naming where the numbers came from.

  * Empty templates for the questionnaire items. The field data has not been
    collected into the project, so these are drawn as labelled but unfilled
    frames with a visible notice. They are not charts of invented numbers.
"""
import sys, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

OUT = sys.argv[1]
plt.rcParams['font.family'] = 'DejaVu Sans'

INK = '#1a1a1a'
MUTED = '#5a5a5a'
# A restrained, print-safe palette that stays legible in greyscale.
PALETTE = ['#c9a227', '#5b7c99', '#7a9e7e', '#b5714f', '#8b7fa8', '#9aa0a6', '#c47f8c']


def _finish(fig, ax, title, source, path):
    # No in-image title: the figure caption in the document carries it.
    if source:
        fig.text(0.5, 0.015, source, ha='center', fontsize=7.2,
                 color=MUTED, style='italic')
    fig.savefig(path, dpi=200, bbox_inches='tight', facecolor='white', pad_inches=0.25)
    plt.close(fig)
    print(f'  wrote {os.path.basename(path)}')


def pie(name, title, labels, values, source, explode_max=True):
    fig, ax = plt.subplots(figsize=(6.0, 4.2))
    total = sum(values)
    explode = [0.045 if (explode_max and v == max(values)) else 0 for v in values]
    wedges, _, autotexts = ax.pie(
        values, explode=explode, colors=PALETTE[:len(values)],
        autopct=lambda pct: f'{pct:.1f}%\n({int(round(pct * total / 100))})',
        startangle=105, pctdistance=0.68,
        wedgeprops={'edgecolor': 'white', 'linewidth': 1.6},
        textprops={'fontsize': 8, 'color': 'white', 'fontweight': 'bold'})
    # A slice of a few per cent has no room for a label inside it, so those are
    # pushed outside the wedge and re-coloured; otherwise they overlap the rim.
    for wedge, txt, val in zip(wedges, autotexts, values):
        if val / total < 0.06:
            ang = np.deg2rad((wedge.theta1 + wedge.theta2) / 2)
            txt.set_position((1.16 * np.cos(ang), 1.16 * np.sin(ang)))
            txt.set_color(INK)
            txt.set_fontsize(7.6)
        else:
            txt.set_color('white')
    ax.legend(wedges, labels, loc='center left', bbox_to_anchor=(0.97, 0.5),
              fontsize=8.4, frameon=False)
    ax.axis('equal')
    _finish(fig, ax, title, source, f'{OUT}/{name}.png')


def barh(name, title, labels, values, source, unit=''):
    fig, ax = plt.subplots(figsize=(6.4, 0.55 * len(labels) + 1.9))
    y = np.arange(len(labels))[::-1]
    bars = ax.barh(y, values, color=PALETTE[:len(values)], height=0.6,
                   edgecolor='white', linewidth=1.1)
    ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=8.6, color=INK)
    ax.set_xlim(0, max(values) * 1.18)
    for b, v in zip(bars, values):
        ax.text(b.get_width() + max(values) * 0.02, b.get_y() + b.get_height() / 2,
                f'{v}{unit}', va='center', fontsize=8.4, fontweight='bold', color=INK)
    ax.spines[['top', 'right', 'left']].set_visible(False)
    ax.spines['bottom'].set_color('#cccccc')
    ax.tick_params(axis='x', labelsize=7.6, colors=MUTED)
    ax.grid(axis='x', color='#eeeeee', linewidth=0.8)
    ax.set_axisbelow(True)
    _finish(fig, ax, title, source, f'{OUT}/{name}.png')


def template(name, title, question, categories):
    """An unfilled chart frame for a questionnaire item awaiting field data."""
    fig, ax = plt.subplots(figsize=(6.0, 3.9))
    y = np.arange(len(categories))[::-1]
    ax.barh(y, [1] * len(categories), color='#f2efe8', height=0.6,
            edgecolor='#c9c2b4', linewidth=1.1, linestyle='--')
    ax.set_yticks(y); ax.set_yticklabels(categories, fontsize=8.6, color=INK)
    ax.set_xlim(0, 1.25)
    ax.set_xticks([])
    for yy in y:
        ax.text(0.5, yy, '—', ha='center', va='center', fontsize=10, color='#b0a894')
    ax.spines[['top', 'right', 'left', 'bottom']].set_visible(False)
    ax.text(0.5, -0.19, 'AWAITING FIELD DATA — enter the response counts to complete this chart',
            transform=ax.transAxes, ha='center', fontsize=8.2, fontweight='bold',
            color='#7A6520',
            bbox=dict(boxstyle='round,pad=0.5', fc='#FCF7E6', ec='#A08B3C',
                      linestyle='--', linewidth=1.1))
    fig.text(0.5, 0.015, question, ha='center', fontsize=7.4, color=MUTED, style='italic')
    fig.savefig(f'{OUT}/{name}.png', dpi=200, bbox_inches='tight',
                facecolor='white', pad_inches=0.25)
    plt.close(fig)
    print(f'  wrote {name}.png  (template)')


# ===================================================== real-data charts
DB = 'Source: live project database, queried September 2026'

pie('fig4-3-roles', 'Distribution of User Accounts by Role',
    ['Student (8)', 'Teacher (2)', 'Parent (1)', 'Platform administrator (1)'],
    [8, 2, 1, 1], DB)

pie('fig7-1-attendance', 'Distribution of Recorded Attendance by Status',
    ['Present (118)', 'Absent (20)', 'Late (3)'],
    [118, 20, 3], DB + ' — 141 attendance records')

pie('fig7-2-invoices', 'Distribution of Invoices by Settlement Status',
    ['Issued, unpaid (5)', 'Paid (1)', 'Partially paid (1)', 'Overdue (1)'],
    [5, 1, 1, 1], DB + ' — 8 invoice records')

pie('fig7-3-verification', 'Outcome of Android Device Verification Items',
    ['Verified on device (16)', 'Not verified — environmental limitation (3)'],
    [16, 3], 'Source: Table 7.7 of this report')

pie('fig8-1-status', 'Implementation Status of Major System Components',
    ['Implemented (12)', 'Partially implemented (3)', 'Not implemented (7)'],
    [12, 3, 7], 'Source: Table 8.1 of this report')

barh('fig7-4-locales', 'Measured Translation Coverage by Language',
     ['English', 'Kiswahili', 'Arabic', 'Somali'], [100, 64, 63, 62],
     'Source: automated translation check (npm run check:i18n), measured September 2026', '%')

barh('fig5-10-tables', 'Database Tables by Functional Area',
     ['Communication', 'Subscription', 'Finance', 'Learning', 'Tenancy and identity',
      'Access control', 'Recitation', 'Operations', 'Attendance'],
     [6, 5, 6, 6, 6, 3, 3, 2, 1],
     'Source: project database schema — 38 tables in total')

# ===================================================== questionnaire templates
template('fig4-1-attendance-practice',
         'Figure 4.1 — How Attendance Is Currently Recorded',
         'Question: How is student attendance currently recorded in your madrasa?',
         ['Exercise book / register', 'Wall chart', 'Teacher’s memory only',
          'Not formally recorded', 'Other'])

template('fig4-2-progress-practice',
         'Figure 4.2 — How Memorisation Progress Is Recorded',
         'Question: How is a student’s Quran memorisation progress recorded?',
         ['Written in a book', 'Teacher remembers', 'Told to parent verbally',
          'Not recorded', 'Other'])

template('fig4-4-parent-communication',
         'Figure 4.4 — How Parents Currently Receive Information',
         'Question: How do parents currently learn about their child’s progress and absence?',
         ['Told at pick-up', 'Phone call', 'Written note', 'Parents’ meeting',
          'They are not informed'])

template('fig4-5-fee-practice',
         'Figure 4.5 — How Fee Obligations Are Recorded and Communicated',
         'Question: How are fee obligations recorded and communicated to parents?',
         ['Written receipt book', 'Verbal reminder', 'Mobile money record only',
          'No formal record', 'Other'])

template('fig4-6-smartphone',
         'Figure 4.6 — Smartphone Access and Preferred Interface Language',
         'Question: Do you have regular smartphone access, and which language would you prefer?',
         ['English', 'Kiswahili', 'Somali', 'Arabic', 'No smartphone access'])

template('fig4-7-willingness',
         'Figure 4.7 — Willingness to Adopt a Mobile Madrasa System',
         'Question: How willing would you be to use a mobile application for madrasa records?',
         ['Very willing', 'Willing', 'Neutral', 'Unwilling', 'Very unwilling'])
