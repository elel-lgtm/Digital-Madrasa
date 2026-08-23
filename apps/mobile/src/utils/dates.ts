import { daysBetween } from '@digital-madrasa/shared';
import type { TFunction } from 'i18next';

export type DueTone = 'neutral' | 'warning' | 'danger' | 'success';

/**
 * One place that decides how a deadline reads, so "Overdue" is always the same
 * word and the same colour whether it's an assignment or an invoice.
 */
export function formatDueLabel(
  dueAt: string,
  t: TFunction,
): { label: string; tone: DueTone; days: number } {
  const days = daysBetween(new Date(), dueAt);

  if (days < 0) {
    return { label: t('student.overdue'), tone: 'danger', days };
  }
  if (days === 0) {
    return { label: t('student.dueToday'), tone: 'warning', days };
  }
  return { label: t('student.dueIn', { count: days }), tone: days <= 2 ? 'warning' : 'neutral', days };
}

/** Short, locale-aware date for list rows: "13 Aug". */
export function shortDate(value: string, locale = 'en-KE'): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
      new Date(value),
    );
  } catch {
    return value.slice(0, 10);
  }
}

/** Full date for detail screens: "13 August 2026". */
export function longDate(value: string, locale = 'en-KE'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}

/** "2 hours ago" style stamps for inbox and message lists. */
export function relativeTime(value: string, t: TFunction): string {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return t('common.today');
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return t('common.yesterday');
  if (days < 7) return `${days}d`;
  return shortDate(value);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
