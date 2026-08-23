/**
 * Static Quran metadata. Ships with the bundle so surah pickers, the hifz
 * heatmap and the offline library work with no network at all.
 *
 * Tuple order: [number, transliterated name, Arabic name, ayah count, revelation place]
 */
type SurahTuple = readonly [number, string, string, number, 'makkah' | 'madinah'];

const SURAH_DATA: readonly SurahTuple[] = [
  [1, 'Al-Fatihah', 'الفاتحة', 7, 'makkah'],
  [2, 'Al-Baqarah', 'البقرة', 286, 'madinah'],
  [3, 'Ali Imran', 'آل عمران', 200, 'madinah'],
  [4, 'An-Nisa', 'النساء', 176, 'madinah'],
  [5, 'Al-Maidah', 'المائدة', 120, 'madinah'],
  [6, 'Al-Anam', 'الأنعام', 165, 'makkah'],
  [7, 'Al-Araf', 'الأعراف', 206, 'makkah'],
  [8, 'Al-Anfal', 'الأنفال', 75, 'madinah'],
  [9, 'At-Tawbah', 'التوبة', 129, 'madinah'],
  [10, 'Yunus', 'يونس', 109, 'makkah'],
  [11, 'Hud', 'هود', 123, 'makkah'],
  [12, 'Yusuf', 'يوسف', 111, 'makkah'],
  [13, 'Ar-Rad', 'الرعد', 43, 'madinah'],
  [14, 'Ibrahim', 'إبراهيم', 52, 'makkah'],
  [15, 'Al-Hijr', 'الحجر', 99, 'makkah'],
  [16, 'An-Nahl', 'النحل', 128, 'makkah'],
  [17, 'Al-Isra', 'الإسراء', 111, 'makkah'],
  [18, 'Al-Kahf', 'الكهف', 110, 'makkah'],
  [19, 'Maryam', 'مريم', 98, 'makkah'],
  [20, 'Ta-Ha', 'طه', 135, 'makkah'],
  [21, 'Al-Anbiya', 'الأنبياء', 112, 'makkah'],
  [22, 'Al-Hajj', 'الحج', 78, 'madinah'],
  [23, 'Al-Muminun', 'المؤمنون', 118, 'makkah'],
  [24, 'An-Nur', 'النور', 64, 'madinah'],
  [25, 'Al-Furqan', 'الفرقان', 77, 'makkah'],
  [26, 'Ash-Shuara', 'الشعراء', 227, 'makkah'],
  [27, 'An-Naml', 'النمل', 93, 'makkah'],
  [28, 'Al-Qasas', 'القصص', 88, 'makkah'],
  [29, 'Al-Ankabut', 'العنكبوت', 69, 'makkah'],
  [30, 'Ar-Rum', 'الروم', 60, 'makkah'],
  [31, 'Luqman', 'لقمان', 34, 'makkah'],
  [32, 'As-Sajdah', 'السجدة', 30, 'makkah'],
  [33, 'Al-Ahzab', 'الأحزاب', 73, 'madinah'],
  [34, 'Saba', 'سبأ', 54, 'makkah'],
  [35, 'Fatir', 'فاطر', 45, 'makkah'],
  [36, 'Ya-Sin', 'يس', 83, 'makkah'],
  [37, 'As-Saffat', 'الصافات', 182, 'makkah'],
  [38, 'Sad', 'ص', 88, 'makkah'],
  [39, 'Az-Zumar', 'الزمر', 75, 'makkah'],
  [40, 'Ghafir', 'غافر', 85, 'makkah'],
  [41, 'Fussilat', 'فصلت', 54, 'makkah'],
  [42, 'Ash-Shura', 'الشورى', 53, 'makkah'],
  [43, 'Az-Zukhruf', 'الزخرف', 89, 'makkah'],
  [44, 'Ad-Dukhan', 'الدخان', 59, 'makkah'],
  [45, 'Al-Jathiyah', 'الجاثية', 37, 'makkah'],
  [46, 'Al-Ahqaf', 'الأحقاف', 35, 'makkah'],
  [47, 'Muhammad', 'محمد', 38, 'madinah'],
  [48, 'Al-Fath', 'الفتح', 29, 'madinah'],
  [49, 'Al-Hujurat', 'الحجرات', 18, 'madinah'],
  [50, 'Qaf', 'ق', 45, 'makkah'],
  [51, 'Adh-Dhariyat', 'الذاريات', 60, 'makkah'],
  [52, 'At-Tur', 'الطور', 49, 'makkah'],
  [53, 'An-Najm', 'النجم', 62, 'makkah'],
  [54, 'Al-Qamar', 'القمر', 55, 'makkah'],
  [55, 'Ar-Rahman', 'الرحمن', 78, 'madinah'],
  [56, 'Al-Waqiah', 'الواقعة', 96, 'makkah'],
  [57, 'Al-Hadid', 'الحديد', 29, 'madinah'],
  [58, 'Al-Mujadila', 'المجادلة', 22, 'madinah'],
  [59, 'Al-Hashr', 'الحشر', 24, 'madinah'],
  [60, 'Al-Mumtahanah', 'الممتحنة', 13, 'madinah'],
  [61, 'As-Saff', 'الصف', 14, 'madinah'],
  [62, 'Al-Jumuah', 'الجمعة', 11, 'madinah'],
  [63, 'Al-Munafiqun', 'المنافقون', 11, 'madinah'],
  [64, 'At-Taghabun', 'التغابن', 18, 'madinah'],
  [65, 'At-Talaq', 'الطلاق', 12, 'madinah'],
  [66, 'At-Tahrim', 'التحريم', 12, 'madinah'],
  [67, 'Al-Mulk', 'الملك', 30, 'makkah'],
  [68, 'Al-Qalam', 'القلم', 52, 'makkah'],
  [69, 'Al-Haqqah', 'الحاقة', 52, 'makkah'],
  [70, 'Al-Maarij', 'المعارج', 44, 'makkah'],
  [71, 'Nuh', 'نوح', 28, 'makkah'],
  [72, 'Al-Jinn', 'الجن', 28, 'makkah'],
  [73, 'Al-Muzzammil', 'المزمل', 20, 'makkah'],
  [74, 'Al-Muddaththir', 'المدثر', 56, 'makkah'],
  [75, 'Al-Qiyamah', 'القيامة', 40, 'makkah'],
  [76, 'Al-Insan', 'الإنسان', 31, 'madinah'],
  [77, 'Al-Mursalat', 'المرسلات', 50, 'makkah'],
  [78, 'An-Naba', 'النبأ', 40, 'makkah'],
  [79, 'An-Naziat', 'النازعات', 46, 'makkah'],
  [80, 'Abasa', 'عبس', 42, 'makkah'],
  [81, 'At-Takwir', 'التكوير', 29, 'makkah'],
  [82, 'Al-Infitar', 'الإنفطار', 19, 'makkah'],
  [83, 'Al-Mutaffifin', 'المطففين', 36, 'makkah'],
  [84, 'Al-Inshiqaq', 'الإنشقاق', 25, 'makkah'],
  [85, 'Al-Buruj', 'البروج', 22, 'makkah'],
  [86, 'At-Tariq', 'الطارق', 17, 'makkah'],
  [87, 'Al-Ala', 'الأعلى', 19, 'makkah'],
  [88, 'Al-Ghashiyah', 'الغاشية', 26, 'makkah'],
  [89, 'Al-Fajr', 'الفجر', 30, 'makkah'],
  [90, 'Al-Balad', 'البلد', 20, 'makkah'],
  [91, 'Ash-Shams', 'الشمس', 15, 'makkah'],
  [92, 'Al-Layl', 'الليل', 21, 'makkah'],
  [93, 'Ad-Duha', 'الضحى', 11, 'makkah'],
  [94, 'Ash-Sharh', 'الشرح', 8, 'makkah'],
  [95, 'At-Tin', 'التين', 8, 'makkah'],
  [96, 'Al-Alaq', 'العلق', 19, 'makkah'],
  [97, 'Al-Qadr', 'القدر', 5, 'makkah'],
  [98, 'Al-Bayyinah', 'البينة', 8, 'madinah'],
  [99, 'Az-Zalzalah', 'الزلزلة', 8, 'madinah'],
  [100, 'Al-Adiyat', 'العاديات', 11, 'makkah'],
  [101, 'Al-Qariah', 'القارعة', 11, 'makkah'],
  [102, 'At-Takathur', 'التكاثر', 8, 'makkah'],
  [103, 'Al-Asr', 'العصر', 3, 'makkah'],
  [104, 'Al-Humazah', 'الهمزة', 9, 'makkah'],
  [105, 'Al-Fil', 'الفيل', 5, 'makkah'],
  [106, 'Quraysh', 'قريش', 4, 'makkah'],
  [107, 'Al-Maun', 'الماعون', 7, 'makkah'],
  [108, 'Al-Kawthar', 'الكوثر', 3, 'makkah'],
  [109, 'Al-Kafirun', 'الكافرون', 6, 'makkah'],
  [110, 'An-Nasr', 'النصر', 3, 'madinah'],
  [111, 'Al-Masad', 'المسد', 5, 'makkah'],
  [112, 'Al-Ikhlas', 'الإخلاص', 4, 'makkah'],
  [113, 'Al-Falaq', 'الفلق', 5, 'makkah'],
  [114, 'An-Nas', 'الناس', 6, 'makkah'],
] as const;

export interface Surah {
  number: number;
  name: string;
  arabicName: string;
  ayahCount: number;
  revelationPlace: 'makkah' | 'madinah';
}

export const SURAHS: readonly Surah[] = SURAH_DATA.map(
  ([number, name, arabicName, ayahCount, revelationPlace]) => ({
    number,
    name,
    arabicName,
    ayahCount,
    revelationPlace,
  }),
);

const surahByNumber = new Map(SURAHS.map((s) => [s.number, s]));

export function getSurah(number: number): Surah | undefined {
  return surahByNumber.get(number);
}

export function surahName(number: number): string {
  return surahByNumber.get(number)?.name ?? `Surah ${number}`;
}

/**
 * First surah of each juz, by juz number. Used to bucket hifz progress into
 * the 30-part view students and parents actually think in.
 */
const JUZ_START_SURAH: readonly number[] = [
  1, 2, 2, 3, 4, 4, 5, 6, 7, 8, 9, 11, 12, 15, 17, 18, 21, 23, 25, 27, 29, 33, 36, 39, 41, 46,
  51, 58, 67, 78,
];

export function juzForSurah(surahNo: number): number {
  let juz = 1;
  for (let i = 0; i < JUZ_START_SURAH.length; i += 1) {
    const start = JUZ_START_SURAH[i];
    if (start !== undefined && start <= surahNo) juz = i + 1;
  }
  return juz;
}

export function surahsInJuz(juzNo: number): Surah[] {
  const start = JUZ_START_SURAH[juzNo - 1] ?? 1;
  const end = JUZ_START_SURAH[juzNo] ?? 115;
  return SURAHS.filter((s) => s.number >= start && (juzNo === 30 ? true : s.number < end));
}

/** Total ayahs in the mushaf, derived rather than hardcoded twice. */
export const TOTAL_AYAHS = SURAHS.reduce((sum, s) => sum + s.ayahCount, 0);
