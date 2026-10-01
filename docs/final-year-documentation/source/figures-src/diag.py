"""Drawing toolkit for the Digital Madrasa documentation figures.

Plain matplotlib so the figures are reproducible from the repository with no
extra tooling. Everything is boxes, arrows and text on a white page, sized for
an A4 column at 200 dpi.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Ellipse, Polygon

INK = '#1a1a1a'
MUTED = '#5a5a5a'
LINE = '#4a4a4a'
FILL = '#f4f1ea'
ACCENT = '#d9b23a'
ACCENT_FILL = '#faf3dc'
BLUE_FILL = '#eaf0f7'
GREEN_FILL = '#eaf3ec'
RED_FILL = '#f9ecea'

plt.rcParams['font.family'] = 'DejaVu Sans'


def canvas(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')
    fig.patch.set_facecolor('white')
    return fig, ax


def box(ax, x, y, w, h, text, fill=FILL, edge=LINE, fs=8, bold=False, radius=1.2):
    ax.add_patch(FancyBboxPatch(
        (x - w / 2, y - h / 2), w, h,
        boxstyle=f'round,pad=0,rounding_size={radius}',
        linewidth=1.1, edgecolor=edge, facecolor=fill, zorder=2))
    ax.text(x, y, text, ha='center', va='center', fontsize=fs, color=INK,
            fontweight='bold' if bold else 'normal', zorder=3, linespacing=1.4)


def cyl(ax, x, y, w, h, text, fill=BLUE_FILL, fs=8):
    """A datastore, drawn as a cylinder."""
    ax.add_patch(FancyBboxPatch(
        (x - w / 2, y - h / 2), w, h, boxstyle='round,pad=0,rounding_size=0.6',
        linewidth=1.1, edgecolor=LINE, facecolor=fill, zorder=2))
    ax.add_patch(Ellipse((x, y + h / 2), w, h * 0.26, linewidth=1.1,
                         edgecolor=LINE, facecolor='white', zorder=3))
    ax.text(x, y - h * 0.06, text, ha='center', va='center', fontsize=fs,
            color=INK, zorder=4, linespacing=1.4)


def oval(ax, x, y, w, h, text, fill=ACCENT_FILL, fs=7.5):
    ax.add_patch(Ellipse((x, y), w, h, linewidth=1.1, edgecolor=LINE,
                         facecolor=fill, zorder=2))
    ax.text(x, y, text, ha='center', va='center', fontsize=fs, color=INK,
            zorder=3, linespacing=1.3)


def diamond(ax, x, y, w, h, text, fill=ACCENT_FILL, fs=7):
    ax.add_patch(Polygon([[x, y + h / 2], [x + w / 2, y], [x, y - h / 2],
                          [x - w / 2, y]], closed=True, linewidth=1.1,
                         edgecolor=LINE, facecolor=fill, zorder=2))
    ax.text(x, y, text, ha='center', va='center', fontsize=fs, color=INK,
            zorder=3, linespacing=1.3)


def actor(ax, x, y, label, fs=8):
    """A stick figure for use-case actors."""
    r = 1.6
    ax.add_patch(Ellipse((x, y + 5), r * 1.6, r * 2.0, linewidth=1.2,
                         edgecolor=INK, facecolor='white', zorder=3))
    ax.plot([x, x], [y + 3.9, y - 0.5], color=INK, lw=1.2, zorder=3)
    ax.plot([x - 2.2, x + 2.2], [y + 2.6, y + 2.6], color=INK, lw=1.2, zorder=3)
    ax.plot([x, x - 1.9], [y - 0.5, y - 4], color=INK, lw=1.2, zorder=3)
    ax.plot([x, x + 1.9], [y - 0.5, y - 4], color=INK, lw=1.2, zorder=3)
    ax.text(x, y - 6, label, ha='center', va='center', fontsize=fs,
            fontweight='bold', color=INK, zorder=3)


def arrow(ax, p, q, text='', style='-|>', dashed=False, fs=6.8, rad=0.0,
          color=LINE, offset=(0, 0), ha='center'):
    ax.add_patch(FancyArrowPatch(
        p, q, arrowstyle=style, mutation_scale=11, linewidth=1.0,
        color=color, zorder=1,
        linestyle=(0, (4, 3)) if dashed else 'solid',
        connectionstyle=f'arc3,rad={rad}',
        shrinkA=2, shrinkB=2))
    if text:
        mx = (p[0] + q[0]) / 2 + offset[0]
        my = (p[1] + q[1]) / 2 + offset[1]
        ax.text(mx, my, text, ha=ha, va='center', fontsize=fs, color=MUTED,
                zorder=4, bbox=dict(boxstyle='round,pad=0.22', fc='white',
                                    ec='none', alpha=0.95))


def title(ax, text):
    """Figure titles live in the document caption, not inside the image."""
    return None


def save(fig, path):
    fig.savefig(path, dpi=200, bbox_inches='tight', facecolor='white',
                pad_inches=0.22)
    plt.close(fig)
    print(f'  wrote {path}')
