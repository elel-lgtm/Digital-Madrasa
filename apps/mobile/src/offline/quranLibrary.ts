import { JUZ_AYAH_COUNT } from '@digital-madrasa/shared';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { env } from '@/config/env';

/**
 * The offline Quran library.
 *
 * Each juz is one small JSON file (the Uthmani text, 30–60 KB) published to
 * the public `quran` Storage bucket by scripts/publish-quran.mjs. A download
 * is written to the app's document directory, so it survives restarts and is
 * readable with no connection at all.
 *
 * A file is only kept if it is the juz that was asked for and holds exactly
 * the number of ayahs that juz has, so a truncated or wrong response can
 * never become the copy a child reads from.
 */

export interface JuzAyah {
  n: number;
  text: string;
}

export interface JuzSurah {
  number: number;
  name: string;
  transliteration: string;
  ayahs: JuzAyah[];
}

export interface JuzBook {
  juz: number;
  surahs: JuzSurah[];
}

/**
 * The library stores files on the phone, which expo-file-system does not do in
 * a browser. The web build (the admin console's host) says so instead of
 * crashing on the first file access.
 */
export const librarySupported = Platform.OS !== 'web';

const folder = () => new Directory(Paths.document, 'quran');
const fileName = (juz: number) => `juz-${String(juz).padStart(2, '0')}.json`;
const fileFor = (juz: number) => new File(folder(), fileName(juz));

function ensureFolder(): void {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
}

export function isDownloaded(juz: number): boolean {
  return fileFor(juz).exists;
}

export function downloadedJuz(): number[] {
  if (!librarySupported) return [];
  return Array.from({ length: 30 }, (_, i) => i + 1).filter(isDownloaded);
}

export function librarySizeBytes(): number {
  if (!librarySupported) return 0;
  return downloadedJuz().reduce((sum, juz) => sum + (fileFor(juz).size ?? 0), 0);
}

function isValidBook(value: unknown, juz: number): value is JuzBook {
  if (!value || typeof value !== 'object') return false;
  const book = value as JuzBook;
  if (book.juz !== juz || !Array.isArray(book.surahs)) return false;
  const ayahs = book.surahs.reduce((n, s) => n + (Array.isArray(s.ayahs) ? s.ayahs.length : 0), 0);
  return ayahs === JUZ_AYAH_COUNT[juz - 1];
}

export class LibraryError extends Error {
  constructor(readonly kind: 'offline' | 'corrupt' | 'unconfigured') {
    super(kind);
  }
}

/** Downloads one juz and keeps it only if it checks out. */
export async function downloadJuz(juz: number): Promise<void> {
  if (!env.supabaseUrl) throw new LibraryError('unconfigured');
  let body: string;
  try {
    const res = await fetch(`${env.supabaseUrl}/storage/v1/object/public/quran/${fileName(juz)}`);
    if (!res.ok) throw new LibraryError('offline');
    body = await res.text();
  } catch (error) {
    if (error instanceof LibraryError) throw error;
    throw new LibraryError('offline');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new LibraryError('corrupt');
  }
  if (!isValidBook(parsed, juz)) throw new LibraryError('corrupt');

  ensureFolder();
  const file = fileFor(juz);
  if (file.exists) file.delete();
  file.create();
  file.write(body);
}

/** Reads a downloaded juz. Works offline. */
export async function readJuz(juz: number): Promise<JuzBook> {
  const file = fileFor(juz);
  if (!file.exists) throw new LibraryError('offline');
  const parsed: unknown = JSON.parse(await file.text());
  if (!isValidBook(parsed, juz)) {
    file.delete();
    throw new LibraryError('corrupt');
  }
  return parsed;
}

export function removeJuz(juz: number): void {
  const file = fileFor(juz);
  if (file.exists) file.delete();
}
