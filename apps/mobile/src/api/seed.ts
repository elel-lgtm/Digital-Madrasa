import {
  SUBSCRIPTION_CURRENCY,
  SUBSCRIPTION_PRICE,
  TRIAL_DAYS,
  isoDate,
  juzForSurah,
  surahName,
  type SavedCard,
  type Subscription,
  type SubscriptionInvoice,
  type SubscriptionPayment,
  type SubscriptionPlan,
  type Announcement,
  type Assignment,
  type AttendanceRecord,
  type AuditEntry,
  type Certificate,
  type FeatureFlags,
  type FeeStructure,
  type Grade,
  type HifzProgress,
  type Invoice,
  type Klass,
  type Lesson,
  type MailItem,
  type Madrasa,
  type Message,
  type Notification,
  type ParentLink,
  type Payment,
  type Profile,
  type Recitation,
  type Student,
  type Submission,
  type Teacher,
  type Thread,
} from '@digital-madrasa/shared';
import { NS, uid } from './ids';

/**
 * The seeded dataset the app runs against until Supabase is wired up.
 *
 * It models one active madrasa with real-looking depth — several classes,
 * sixteen students, fee arrears in various states, graded and ungraded
 * recitations — so that every screen can be judged on real density instead of
 * a single happy-path row.
 */

export interface MockDatabase {
  profiles: Profile[];
  madrasas: Madrasa[];
  students: Student[];
  teachers: Teacher[];
  classes: Klass[];
  links: ParentLink[];
  lessons: Lesson[];
  assignments: Assignment[];
  submissions: Submission[];
  hifz: HifzProgress[];
  recitations: Recitation[];
  attendance: AttendanceRecord[];
  grades: Grade[];
  feeStructures: FeeStructure[];
  invoices: Invoice[];
  payments: Payment[];
  threads: Thread[];
  messages: Message[];
  announcements: Announcement[];
  mail: MailItem[];
  notifications: Notification[];
  certificates: Certificate[];
  audit: AuditEntry[];
  plans: SubscriptionPlan[];
  subscriptions: Subscription[];
  subInvoices: SubscriptionInvoice[];
  subPayments: SubscriptionPayment[];
  savedCards: SavedCard[];
  featureFlags: Record<string, FeatureFlags>;
  /** Mirrors `admission_counters`: last sequence issued per year. */
  admissionCounters: Record<number, number>;
  /** Mock credential table. Real auth never stores passwords like this. */
  credentials: { email: string; password: string; profileId: string }[];
}

const now = new Date();

function daysFromNow(days: number, hour = 9): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function daysAgo(days: number, hour = 9): string {
  return daysFromNow(-days, hour);
}

/** Relative to the exact moment of seeding — used for the live session demo. */
function minutesFromNow(minutes: number): string {
  return new Date(now.getTime() + minutes * 60_000).toISOString();
}

/**
 * The lessons that are deliberately "in progress" whenever the demo is opened:
 * one on the owner's class, one on Fatuma's, so every staff account has a live
 * session of its own. `mock.ts` re-dates these on restore so they never go
 * stale between app launches.
 */
export const DEMO_LIVE_LESSONS = [
  { id: uid(NS.lesson, 6), minutesOffset: -10 },
  { id: uid(NS.lesson, 7), minutesOffset: -5 },
] as const;

const MADRASA_ID = uid(NS.madrasa, 1);
const YEAR = now.getFullYear();

const OWNER_ID = uid(NS.profile, 1);
const TEACHER_2_ID = uid(NS.profile, 2);
const TEACHER_3_ID = uid(NS.profile, 3);
const PARENT_1_ID = uid(NS.profile, 10);
const PARENT_2_ID = uid(NS.profile, 11);

const CLASS_HIFZ_1 = uid(NS.klass, 1);
const CLASS_HIFZ_2 = uid(NS.klass, 2);
const CLASS_TAJWEED = uid(NS.klass, 3);
const CLASS_QAIDAH = uid(NS.klass, 4);

/** Student roster: [seq, name, class, gender, birth year, admission year] */
const ROSTER: readonly [number, string, string, 'male' | 'female', number, number][] = [
  [1, 'Ahmed Abdi Mohamed', CLASS_HIFZ_1, 'male', 2013, YEAR - 1],
  [2, 'Fatuma Hassan Ali', CLASS_HIFZ_1, 'female', 2013, YEAR - 1],
  [3, 'Yusuf Ibrahim Sheikh', CLASS_HIFZ_1, 'male', 2014, YEAR - 1],
  [4, 'Maryam Abdullahi Noor', CLASS_HIFZ_1, 'female', 2013, YEAR - 1],
  [5, 'Abdirahman Osman Farah', CLASS_HIFZ_2, 'male', 2011, YEAR - 1],
  [6, 'Halima Aden Mohamud', CLASS_HIFZ_2, 'female', 2011, YEAR - 1],
  [7, 'Ismail Ahmed Warsame', CLASS_HIFZ_2, 'male', 2012, YEAR - 1],
  [8, 'Khadija Salim Omar', CLASS_HIFZ_2, 'female', 2012, YEAR - 1],
  [9, 'Bilal Mohamed Iman', CLASS_TAJWEED, 'male', 2014, YEAR],
  [10, 'Amina Yusuf Barre', CLASS_TAJWEED, 'female', 2014, YEAR],
  [11, 'Suleiman Ali Dahir', CLASS_TAJWEED, 'male', 2015, YEAR],
  [12, 'Zainab Hussein Ege', CLASS_TAJWEED, 'female', 2015, YEAR],
  [13, 'Omar Abdikadir Jama', CLASS_QAIDAH, 'male', 2017, YEAR],
  [14, 'Sumaya Nur Hassan', CLASS_QAIDAH, 'female', 2017, YEAR],
  [15, 'Hamza Sharif Abdi', CLASS_QAIDAH, 'male', 2018, YEAR],
  [16, 'Ruqiya Abdi Salat', CLASS_QAIDAH, 'female', 2018, YEAR],
];

function admissionNo(year: number, seq: number): string {
  return `DM-${year}-${String(seq).padStart(4, '0')}`;
}

export function createSeed(): MockDatabase {
  // ---------------------------------------------------------------- people
  const madrasa: Madrasa = {
    id: MADRASA_ID,
    name: 'Madrasat An-Nur',
    slug: 'madrasat-an-nur',
    county: 'Mandera',
    town: 'Mandera Town',
    ownerId: OWNER_ID,
    logoUrl: null,
    contactEmail: 'admin@annur.example',
    contactPhone: '+254712000001',
    timezone: 'Africa/Nairobi',
    status: 'active',
    createdAt: daysAgo(420),
    studentCount: ROSTER.length,
    teacherCount: 3,
  };

  const profiles: Profile[] = [
    {
      id: OWNER_ID,
      role: 'teacher',
      madrasaId: MADRASA_ID,
      fullName: 'Ustadh Abdirahman Hassan',
      email: 'owner@annur.example',
      phone: '+254712000001',
      avatarUrl: null,
      locale: 'en',
      isPlatformAdmin: false,
      isActive: true,
      createdAt: daysAgo(420),
    },
    {
      id: TEACHER_2_ID,
      role: 'teacher',
      madrasaId: MADRASA_ID,
      fullName: 'Ustadha Fatuma Ali',
      email: 'fatuma@annur.example',
      phone: '+254712000002',
      avatarUrl: null,
      locale: 'en',
      isPlatformAdmin: false,
      isActive: true,
      createdAt: daysAgo(380),
    },
    {
      id: TEACHER_3_ID,
      role: 'teacher',
      madrasaId: MADRASA_ID,
      fullName: 'Ustadh Yusuf Noor',
      email: 'yusuf@annur.example',
      phone: '+254712000003',
      avatarUrl: null,
      locale: 'sw',
      isPlatformAdmin: false,
      isActive: true,
      createdAt: daysAgo(200),
    },
    {
      id: PARENT_1_ID,
      role: 'parent',
      madrasaId: MADRASA_ID,
      fullName: 'Amina Yusuf',
      email: 'parent@example.com',
      phone: '+254722000010',
      avatarUrl: null,
      locale: 'en',
      isPlatformAdmin: false,
      isActive: true,
      createdAt: daysAgo(150),
    },
    {
      id: PARENT_2_ID,
      role: 'parent',
      madrasaId: MADRASA_ID,
      fullName: 'Ibrahim Sheikh',
      email: 'ibrahim@example.com',
      phone: '+254722000011',
      avatarUrl: null,
      locale: 'so',
      isPlatformAdmin: false,
      isActive: true,
      createdAt: daysAgo(20),
    },
  ];

  const teachers: Teacher[] = [
    {
      id: uid(NS.teacher, 1),
      profileId: OWNER_ID,
      madrasaId: MADRASA_ID,
      fullName: 'Ustadh Abdirahman Hassan',
      email: 'owner@annur.example',
      phone: '+254712000001',
      avatarUrl: null,
      employeeNo: 'STF-001',
      specialisation: 'Hifz & Ijazah',
      qiraahStyles: ['hafs', 'warsh'],
      isOwner: true,
      status: 'active',
      classCount: 1,
    },
    {
      id: uid(NS.teacher, 2),
      profileId: TEACHER_2_ID,
      madrasaId: MADRASA_ID,
      fullName: 'Ustadha Fatuma Ali',
      email: 'fatuma@annur.example',
      phone: '+254712000002',
      avatarUrl: null,
      employeeNo: 'STF-002',
      specialisation: 'Tajweed',
      qiraahStyles: ['hafs'],
      isOwner: false,
      status: 'active',
      classCount: 2,
    },
    {
      id: uid(NS.teacher, 3),
      profileId: TEACHER_3_ID,
      madrasaId: MADRASA_ID,
      fullName: 'Ustadh Yusuf Noor',
      email: 'yusuf@annur.example',
      phone: '+254712000003',
      avatarUrl: null,
      employeeNo: 'STF-003',
      specialisation: 'Qaidah & Foundations',
      qiraahStyles: ['hafs'],
      isOwner: false,
      status: 'active',
      classCount: 1,
    },
  ];

  const classes: Klass[] = [
    {
      id: CLASS_HIFZ_1,
      madrasaId: MADRASA_ID,
      name: 'Hifz Level 1',
      level: 'Intermediate',
      teacherId: uid(NS.teacher, 1),
      teacherName: 'Ustadh Abdirahman Hassan',
      schedule: [
        { day: 'monday', startTime: '06:00', endTime: '08:00' },
        { day: 'wednesday', startTime: '06:00', endTime: '08:00' },
        { day: 'saturday', startTime: '08:00', endTime: '10:00' },
      ],
      capacity: 20,
      studentCount: 4,
    },
    {
      id: CLASS_HIFZ_2,
      madrasaId: MADRASA_ID,
      name: 'Hifz Level 2',
      level: 'Advanced',
      teacherId: uid(NS.teacher, 2),
      teacherName: 'Ustadha Fatuma Ali',
      schedule: [
        { day: 'tuesday', startTime: '06:00', endTime: '08:00' },
        { day: 'thursday', startTime: '06:00', endTime: '08:00' },
      ],
      capacity: 18,
      studentCount: 4,
    },
    {
      id: CLASS_TAJWEED,
      madrasaId: MADRASA_ID,
      name: 'Tajweed Foundation',
      level: 'Beginner',
      teacherId: uid(NS.teacher, 2),
      teacherName: 'Ustadha Fatuma Ali',
      schedule: [{ day: 'friday', startTime: '15:00', endTime: '17:00' }],
      capacity: 25,
      studentCount: 4,
    },
    {
      id: CLASS_QAIDAH,
      madrasaId: MADRASA_ID,
      name: 'Qaidah Beginners',
      level: 'Foundation',
      teacherId: uid(NS.teacher, 3),
      teacherName: 'Ustadh Yusuf Noor',
      schedule: [
        { day: 'monday', startTime: '15:00', endTime: '16:30' },
        { day: 'wednesday', startTime: '15:00', endTime: '16:30' },
      ],
      capacity: 30,
      studentCount: 4,
    },
  ];

  const classNameById = new Map(classes.map((c) => [c.id, c.name]));

  const students: Student[] = ROSTER.map(([seq, fullName, classId, gender, birthYear, admYear]) => ({
    id: uid(NS.student, seq),
    profileId: uid(NS.profile, 100 + seq),
    madrasaId: MADRASA_ID,
    admissionNo: admissionNo(admYear, admYear === YEAR ? seq - 8 : seq),
    admissionYear: admYear,
    fullName,
    avatarUrl: null,
    dateOfBirth: `${birthYear}-0${((seq % 9) + 1).toString()}-1${(seq % 9).toString()}`,
    gender,
    classId,
    className: classNameById.get(classId) ?? null,
    enrollmentStatus: 'active' as const,
    guardianNotes: null,
    createdAt: daysAgo(300 - seq * 5),
  }));

  // Student profiles, so a student can sign in and see their own world.
  students.forEach((student) => {
    profiles.push({
      id: student.profileId,
      role: 'student',
      madrasaId: MADRASA_ID,
      fullName: student.fullName,
      email: `${student.admissionNo.toLowerCase()}@annur.example`,
      phone: null,
      avatarUrl: null,
      locale: 'en',
      isPlatformAdmin: false,
      isActive: true,
      createdAt: student.createdAt,
    });
  });

  const firstStudent = students[0]!;
  const secondStudent = students[4]!;
  const thirdStudent = students[9]!;

  // ------------------------------------------------------- parent linking
  const links: ParentLink[] = [
    {
      id: uid(NS.link, 1),
      parentId: PARENT_1_ID,
      parentName: 'Amina Yusuf',
      parentPhone: '+254722000010',
      studentId: firstStudent.id,
      studentName: firstStudent.fullName,
      admissionNo: firstStudent.admissionNo,
      madrasaId: MADRASA_ID,
      relationship: 'mother',
      status: 'approved',
      requestedAt: daysAgo(148),
      decidedAt: daysAgo(147),
    },
    {
      id: uid(NS.link, 2),
      parentId: PARENT_1_ID,
      parentName: 'Amina Yusuf',
      parentPhone: '+254722000010',
      studentId: secondStudent.id,
      studentName: secondStudent.fullName,
      admissionNo: secondStudent.admissionNo,
      madrasaId: MADRASA_ID,
      relationship: 'mother',
      status: 'approved',
      requestedAt: daysAgo(140),
      decidedAt: daysAgo(139),
    },
    {
      id: uid(NS.link, 3),
      parentId: PARENT_2_ID,
      parentName: 'Ibrahim Sheikh',
      parentPhone: '+254722000011',
      studentId: thirdStudent.id,
      studentName: thirdStudent.fullName,
      admissionNo: thirdStudent.admissionNo,
      madrasaId: MADRASA_ID,
      relationship: 'father',
      status: 'pending',
      requestedAt: daysAgo(1),
      decidedAt: null,
    },
  ];

  // ------------------------------------------------------------- learning
  const lessons: Lesson[] = [
    // Two sessions are already running: one on the owner's class and one on
    // Fatuma's, so both the owner and a regular teacher have a live class of
    // their own to demonstrate rather than only the owner.
    {
      id: DEMO_LIVE_LESSONS[0].id,
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_1,
      className: 'Hifz Level 1',
      teacherId: uid(NS.teacher, 1),
      title: 'Live revision circle',
      surahFrom: 78,
      ayahFrom: 1,
      surahTo: 78,
      ayahTo: 40,
      qiraahStyle: 'hafs',
      resourceUrls: [],
      scheduledFor: minutesFromNow(DEMO_LIVE_LESSONS[0].minutesOffset),
      notes: 'Join from wherever you are. Bring your mushaf.',
      meetingUrl: 'https://meet.google.com/dmr-live-hifz',
    },
    {
      id: DEMO_LIVE_LESSONS[1].id,
      madrasaId: MADRASA_ID,
      classId: CLASS_TAJWEED,
      className: 'Tajweed Foundation',
      teacherId: uid(NS.teacher, 2),
      title: 'Live tajweed clinic',
      surahFrom: 78,
      ayahFrom: 1,
      surahTo: 78,
      ayahTo: 20,
      qiraahStyle: 'hafs',
      resourceUrls: [],
      scheduledFor: minutesFromNow(DEMO_LIVE_LESSONS[1].minutesOffset),
      notes: 'Bring the noon sakinah worksheet from last week.',
      meetingUrl: 'https://teams.microsoft.com/l/meetup-join/annur-tajweed',
    },
    {
      id: uid(NS.lesson, 1),
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_1,
      className: 'Hifz Level 1',
      teacherId: uid(NS.teacher, 1),
      title: 'Surah Al-Mulk — first half',
      surahFrom: 67,
      ayahFrom: 1,
      surahTo: 67,
      ayahTo: 15,
      qiraahStyle: 'hafs',
      resourceUrls: [],
      scheduledFor: daysFromNow(1, 6),
      notes: 'Focus on the madd in ayah 3 and the qalqalah on the qaf.',
      meetingUrl: 'https://meet.google.com/dmr-alm-ulk',
    },
    {
      id: uid(NS.lesson, 2),
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_1,
      className: 'Hifz Level 1',
      teacherId: uid(NS.teacher, 1),
      title: 'Surah Al-Mulk — completion',
      surahFrom: 67,
      ayahFrom: 16,
      surahTo: 67,
      ayahTo: 30,
      qiraahStyle: 'hafs',
      resourceUrls: [],
      scheduledFor: daysFromNow(3, 6),
      notes: null,
      meetingUrl: null,
    },
    {
      id: uid(NS.lesson, 3),
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_2,
      className: 'Hifz Level 2',
      teacherId: uid(NS.teacher, 2),
      title: 'Surah Ya-Sin revision',
      surahFrom: 36,
      ayahFrom: 1,
      surahTo: 36,
      ayahTo: 40,
      qiraahStyle: 'hafs',
      resourceUrls: [],
      scheduledFor: daysFromNow(2, 6),
      notes: null,
      meetingUrl: 'https://teams.microsoft.com/l/meetup-join/annur-yasin',
    },
    {
      id: uid(NS.lesson, 4),
      madrasaId: MADRASA_ID,
      classId: CLASS_TAJWEED,
      className: 'Tajweed Foundation',
      teacherId: uid(NS.teacher, 2),
      title: 'Rules of Noon Sakinah',
      surahFrom: 78,
      ayahFrom: 1,
      surahTo: 78,
      ayahTo: 20,
      qiraahStyle: 'hafs',
      resourceUrls: [],
      scheduledFor: daysFromNow(4, 15),
      notes: 'Izhar, idgham, iqlab and ikhfa with examples from Juz Amma.',
      meetingUrl: 'https://us02web.zoom.us/j/85512345678',
    },
    {
      id: uid(NS.lesson, 5),
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_1,
      className: 'Hifz Level 1',
      teacherId: uid(NS.teacher, 1),
      title: 'Surah As-Sajdah',
      surahFrom: 32,
      ayahFrom: 1,
      surahTo: 32,
      ayahTo: 30,
      qiraahStyle: 'hafs',
      resourceUrls: [],
      scheduledFor: daysAgo(4, 6),
      notes: null,
      meetingUrl: null,
    },
  ];

  const assignments: Assignment[] = [
    {
      id: uid(NS.assignment, 1),
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_1,
      className: 'Hifz Level 1',
      lessonId: uid(NS.lesson, 1),
      title: 'Recite Al-Mulk 1–15 from memory',
      instructions:
        'Record yourself reciting Surah Al-Mulk verses 1 to 15 without looking at the mushaf. Take your time and recite at a steady pace.',
      assignmentType: 'memorisation',
      dueAt: daysFromNow(2, 18),
      submissionCount: 1,
      studentCount: 4,
      mySubmissionStatus: 'not_submitted',
    },
    {
      id: uid(NS.assignment, 2),
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_1,
      className: 'Hifz Level 1',
      lessonId: uid(NS.lesson, 5),
      title: 'Tajweed check — As-Sajdah 1–10',
      instructions: 'Recite carefully and pay attention to the ghunnah.',
      assignmentType: 'tajweed',
      dueAt: daysFromNow(-1, 18),
      submissionCount: 3,
      studentCount: 4,
      mySubmissionStatus: 'graded',
    },
    {
      id: uid(NS.assignment, 3),
      madrasaId: MADRASA_ID,
      classId: CLASS_HIFZ_2,
      className: 'Hifz Level 2',
      lessonId: uid(NS.lesson, 3),
      title: 'Ya-Sin 1–40 revision recording',
      instructions: 'Revision recitation for this week.',
      assignmentType: 'recitation',
      dueAt: daysFromNow(5, 18),
      submissionCount: 0,
      studentCount: 4,
      mySubmissionStatus: 'not_submitted',
    },
    {
      id: uid(NS.assignment, 4),
      madrasaId: MADRASA_ID,
      classId: CLASS_TAJWEED,
      className: 'Tajweed Foundation',
      lessonId: uid(NS.lesson, 4),
      title: 'Write five examples of ikhfa',
      instructions: 'Find five examples of ikhfa in Juz Amma and write them out.',
      assignmentType: 'written',
      dueAt: daysFromNow(6, 18),
      submissionCount: 2,
      studentCount: 4,
      mySubmissionStatus: 'not_submitted',
    },
  ];

  const submissions: Submission[] = [
    {
      id: uid(NS.submission, 1),
      assignmentId: uid(NS.assignment, 2),
      assignmentTitle: 'Tajweed check — As-Sajdah 1–10',
      studentId: firstStudent.id,
      studentName: firstStudent.fullName,
      madrasaId: MADRASA_ID,
      audioUrl: 'mock://recitation/1',
      textBody: null,
      submittedAt: daysAgo(2, 17),
      status: 'graded',
      score: 88,
    },
    {
      id: uid(NS.submission, 2),
      assignmentId: uid(NS.assignment, 2),
      assignmentTitle: 'Tajweed check — As-Sajdah 1–10',
      studentId: students[1]!.id,
      studentName: students[1]!.fullName,
      madrasaId: MADRASA_ID,
      audioUrl: 'mock://recitation/2',
      textBody: null,
      submittedAt: daysAgo(2, 18),
      status: 'pending',
      score: null,
    },
    {
      id: uid(NS.submission, 3),
      assignmentId: uid(NS.assignment, 2),
      assignmentTitle: 'Tajweed check — As-Sajdah 1–10',
      studentId: students[2]!.id,
      studentName: students[2]!.fullName,
      madrasaId: MADRASA_ID,
      audioUrl: 'mock://recitation/3',
      textBody: null,
      submittedAt: daysAgo(1, 20),
      status: 'pending',
      score: null,
    },
  ];

  // Hifz progress: the first student is well into juz 29–30, others vary.
  const hifz: HifzProgress[] = [];
  let hifzSeq = 0;
  const memorisedSurahsByStudent: Record<string, number[]> = {
    [firstStudent.id]: [
      114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98, 97, 96,
      95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 67, 36,
    ],
    [secondStudent.id]: [
      114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98, 97, 96,
      95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78, 67, 55, 36, 18, 2,
    ],
  };

  students.forEach((student) => {
    const memorised =
      memorisedSurahsByStudent[student.id] ??
      [114, 113, 112, 111, 110, 109, 108, 107, 106, 105].slice(0, 4 + (Number(student.id.slice(-1)) % 6));
    memorised.forEach((surahNo, index) => {
      hifzSeq += 1;
      const isRecent = index < 3;
      hifz.push({
        id: uid(NS.hifz, hifzSeq),
        studentId: student.id,
        surahNo,
        surahName: surahName(surahNo),
        juzNo: juzForSurah(surahNo),
        ayahNo: 1,
        status: isRecent ? 'revising' : index < 6 ? 'memorised' : 'mastered',
        confidenceScore: isRecent ? 0.72 : 0.93,
        lastRevisedAt: daysAgo(index + 1),
        nextReviewAt: isRecent ? daysFromNow(0, 6) : daysFromNow(index, 6),
      });
    });
  });

  // ---------------------------------------------------------- recitations
  const recitations: Recitation[] = [
    {
      id: uid(NS.recitation, 1),
      studentId: firstStudent.id,
      studentName: firstStudent.fullName,
      madrasaId: MADRASA_ID,
      audioUrl: 'mock://recitation/1',
      durationMs: 96_000,
      surahNo: 32,
      surahName: surahName(32),
      ayahFrom: 1,
      ayahTo: 10,
      qiraahStyle: 'hafs',
      createdAt: daysAgo(2, 17),
      feedback: {
        overallScore: 88,
        errors: [
          {
            surahNo: 32,
            ayahNo: 4,
            wordIndex: 6,
            rule: 'madd',
            severity: 'moderate',
            note: 'The madd here should be held for about four counts. You moved on after two.',
          },
          {
            surahNo: 32,
            ayahNo: 7,
            wordIndex: 2,
            rule: 'qalqalah',
            severity: 'minor',
            note: 'Give the qaf a light bounce when you stop on it.',
          },
        ],
        modelVersion: 'tajweed-eval-0.4.2',
        processingMs: 4210,
        reviewedByTeacherId: uid(NS.teacher, 1),
        teacherOverride: {
          overallScore: 90,
          remarks: 'Very good. Watch the madd in ayah 4 and you will be ready to move on.',
        },
      },
      syncState: 'synced',
    },
    {
      id: uid(NS.recitation, 2),
      studentId: students[1]!.id,
      studentName: students[1]!.fullName,
      madrasaId: MADRASA_ID,
      audioUrl: 'mock://recitation/2',
      durationMs: 88_000,
      surahNo: 32,
      surahName: surahName(32),
      ayahFrom: 1,
      ayahTo: 10,
      qiraahStyle: 'hafs',
      createdAt: daysAgo(2, 18),
      feedback: {
        overallScore: 74,
        errors: [
          {
            surahNo: 32,
            ayahNo: 2,
            wordIndex: 3,
            rule: 'ghunnah',
            severity: 'major',
            note: 'Hold the nasal sound on the noon for two counts before moving on.',
          },
          {
            surahNo: 32,
            ayahNo: 5,
            wordIndex: 8,
            rule: 'ikhfa',
            severity: 'moderate',
            note: 'The noon should be hidden here, not pronounced clearly.',
          },
          {
            surahNo: 32,
            ayahNo: 9,
            wordIndex: 1,
            rule: 'tafkhim',
            severity: 'minor',
            note: 'The ra is heavy in this position — round the mouth a little more.',
          },
        ],
        modelVersion: 'tajweed-eval-0.4.2',
        processingMs: 3980,
        reviewedByTeacherId: null,
        teacherOverride: null,
      },
      syncState: 'synced',
    },
    {
      id: uid(NS.recitation, 3),
      studentId: students[2]!.id,
      studentName: students[2]!.fullName,
      madrasaId: MADRASA_ID,
      audioUrl: 'mock://recitation/3',
      durationMs: 102_000,
      surahNo: 32,
      surahName: surahName(32),
      ayahFrom: 1,
      ayahTo: 10,
      qiraahStyle: 'hafs',
      createdAt: daysAgo(1, 20),
      feedback: {
        overallScore: 81,
        errors: [
          {
            surahNo: 32,
            ayahNo: 3,
            wordIndex: 5,
            rule: 'idgham',
            severity: 'moderate',
            note: 'Merge the two letters smoothly rather than reciting them separately.',
          },
        ],
        modelVersion: 'tajweed-eval-0.4.2',
        processingMs: 4402,
        reviewedByTeacherId: null,
        teacherOverride: null,
      },
      syncState: 'synced',
    },
    {
      id: uid(NS.recitation, 4),
      studentId: firstStudent.id,
      studentName: firstStudent.fullName,
      madrasaId: MADRASA_ID,
      audioUrl: 'mock://recitation/4',
      durationMs: 64_000,
      surahNo: 67,
      surahName: surahName(67),
      ayahFrom: 1,
      ayahTo: 8,
      qiraahStyle: 'hafs',
      createdAt: daysAgo(6, 7),
      feedback: {
        overallScore: 92,
        errors: [],
        modelVersion: 'tajweed-eval-0.4.1',
        processingMs: 3110,
        reviewedByTeacherId: uid(NS.teacher, 1),
        teacherOverride: null,
      },
      syncState: 'synced',
    },
  ];

  // ---------------------------------------------------------- attendance
  const attendance: AttendanceRecord[] = [];
  let attSeq = 0;
  for (let dayOffset = 1; dayOffset <= 21; dayOffset += 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    // Madrasa runs Saturday to Thursday; Friday is off.
    if (date.getDay() === 5) continue;
    students.forEach((student, index) => {
      attSeq += 1;
      const roll = (dayOffset * 7 + index * 3) % 20;
      const status =
        roll === 0 ? 'absent' : roll === 1 ? 'late' : roll === 2 ? 'excused' : 'present';
      attendance.push({
        id: uid(NS.attendance, attSeq),
        studentId: student.id,
        studentName: student.fullName,
        classId: student.classId!,
        sessionDate: isoDate(date),
        status,
        method: dayOffset % 4 === 0 ? 'qr' : 'manual',
        note: null,
      });
    });
  }

  // -------------------------------------------------------------- grades
  const grades: Grade[] = [];
  let gradeSeq = 0;
  const subjects = ['Hifz', 'Tajweed', 'Fiqh', 'Seerah', 'Arabic'];
  students.forEach((student, sIndex) => {
    subjects.forEach((subject, subIndex) => {
      gradeSeq += 1;
      const base = 62 + ((sIndex * 5 + subIndex * 7) % 34);
      grades.push({
        id: uid(NS.grade, gradeSeq),
        studentId: student.id,
        studentName: student.fullName,
        classId: student.classId!,
        term: `Term 2 ${YEAR}`,
        subject,
        score: base,
        maxScore: 100,
        remarks: base > 85 ? 'Excellent effort this term.' : null,
        issuedAt: daysAgo(12),
      });
    });
  });

  // ------------------------------------------------------- fees & money
  const feeStructures: FeeStructure[] = [
    {
      id: uid(NS.feeStructure, 1),
      madrasaId: MADRASA_ID,
      name: `Term 2 ${YEAR} tuition`,
      academicYear: YEAR,
      term: 'Term 2',
      amount: 3500,
      currency: 'KES',
      appliesTo: 'all',
      classId: null,
      isActive: true,
    },
    {
      id: uid(NS.feeStructure, 2),
      madrasaId: MADRASA_ID,
      name: 'Hifz programme supplement',
      academicYear: YEAR,
      term: 'Term 2',
      amount: 1200,
      currency: 'KES',
      appliesTo: 'class',
      classId: CLASS_HIFZ_1,
      isActive: true,
    },
    {
      id: uid(NS.feeStructure, 3),
      madrasaId: MADRASA_ID,
      name: 'Books and materials',
      academicYear: YEAR,
      term: 'Term 2',
      amount: 800,
      currency: 'KES',
      appliesTo: 'all',
      classId: null,
      isActive: true,
    },
  ];

  const invoices: Invoice[] = [];
  let invSeq = 0;
  students.forEach((student, index) => {
    // Everyone gets tuition; hifz students also get the supplement.
    const applicable = feeStructures.filter(
      (fs) => fs.appliesTo === 'all' || fs.classId === student.classId,
    );
    applicable.forEach((fs) => {
      invSeq += 1;
      const dueOffset = fs.id === uid(NS.feeStructure, 3) ? -9 : 6;
      // Spread the roster across paid / partly paid / due / overdue.
      const bucket = (index + (fs.appliesTo === 'all' ? 0 : 2)) % 4;
      const amountPaid =
        bucket === 0 ? fs.amount : bucket === 1 ? Math.round(fs.amount * 0.4) : 0;
      const isOverdue = dueOffset < 0 && amountPaid < fs.amount;
      const status: Invoice['status'] =
        amountPaid >= fs.amount
          ? 'paid'
          : isOverdue
            ? 'overdue'
            : amountPaid > 0
              ? 'partially_paid'
              : 'issued';
      invoices.push({
        id: uid(NS.invoice, invSeq),
        madrasaId: MADRASA_ID,
        studentId: student.id,
        studentName: student.fullName,
        admissionNo: student.admissionNo,
        invoiceNo: `INV-${YEAR}-${String(invSeq).padStart(4, '0')}`,
        feeStructureId: fs.id,
        description: fs.name,
        amountDue: fs.amount,
        amountPaid,
        currency: 'KES',
        dueDate: isoDate(new Date(now.getTime() + dueOffset * 86_400_000)),
        status,
        issuedAt: daysAgo(20),
        notes: null,
      });
    });
  });

  const payments: Payment[] = invoices
    .filter((inv) => inv.amountPaid > 0)
    .slice(0, 12)
    .map((inv, index) => ({
      id: uid(NS.payment, index + 1),
      madrasaId: MADRASA_ID,
      invoiceIds: [inv.id],
      parentId: index % 2 === 0 ? PARENT_1_ID : PARENT_2_ID,
      amount: inv.amountPaid,
      currency: 'KES',
      method: index % 3 === 0 ? 'cash' : 'mpesa',
      providerRef: index % 3 === 0 ? null : `S${(index + 1) * 7919}KJ4`,
      checkoutRequestId: index % 3 === 0 ? null : `ws_CO_${(index + 1) * 104729}`,
      status: 'success' as const,
      createdAt: daysAgo(14 - index),
      settledAt: daysAgo(14 - index),
      receiptNo: `RCP-${YEAR}-${String(index + 1).padStart(4, '0')}`,
    }));

  // -------------------------------------------------- comms & inbox
  const threads: Thread[] = [
    {
      id: uid(NS.thread, 1),
      subjectName: firstStudent.fullName,
      counterpartId: OWNER_ID,
      counterpartName: 'Ustadh Abdirahman Hassan',
      counterpartRole: 'teacher',
      lastMessage: 'Ahmed is doing very well with Surah Al-Mulk, masha Allah.',
      lastMessageAt: daysAgo(1, 16),
      unreadCount: 1,
    },
    {
      id: uid(NS.thread, 2),
      subjectName: secondStudent.fullName,
      counterpartId: TEACHER_2_ID,
      counterpartName: 'Ustadha Fatuma Ali',
      counterpartRole: 'teacher',
      lastMessage: 'Please make sure he brings his mushaf on Thursday.',
      lastMessageAt: daysAgo(4, 11),
      unreadCount: 0,
    },
  ];

  const messages: Message[] = [
    {
      id: uid(NS.message, 1),
      threadId: uid(NS.thread, 1),
      senderId: PARENT_1_ID,
      senderName: 'Amina Yusuf',
      recipientId: OWNER_ID,
      body: 'Assalamu alaikum ustadh. How is Ahmed getting on with his revision?',
      attachmentUrl: null,
      createdAt: daysAgo(2, 9),
      readAt: daysAgo(2, 10),
    },
    {
      id: uid(NS.message, 2),
      threadId: uid(NS.thread, 1),
      senderId: OWNER_ID,
      senderName: 'Ustadh Abdirahman Hassan',
      recipientId: PARENT_1_ID,
      body: 'Wa alaikum assalam. Ahmed is doing very well with Surah Al-Mulk, masha Allah.',
      attachmentUrl: null,
      createdAt: daysAgo(1, 16),
      readAt: null,
    },
    {
      id: uid(NS.message, 3),
      threadId: uid(NS.thread, 2),
      senderId: TEACHER_2_ID,
      senderName: 'Ustadha Fatuma Ali',
      recipientId: PARENT_1_ID,
      body: 'Please make sure he brings his mushaf on Thursday.',
      attachmentUrl: null,
      createdAt: daysAgo(4, 11),
      readAt: daysAgo(4, 12),
    },
  ];

  const announcements: Announcement[] = [
    {
      id: uid(NS.announcement, 1),
      madrasaId: MADRASA_ID,
      authorId: OWNER_ID,
      authorName: 'Ustadh Abdirahman Hassan',
      title: 'Ramadan timetable',
      body: 'Classes will move to after Taraweeh during Ramadan, starting 9:00 pm. Morning hifz sessions continue as normal.',
      audience: ['students', 'parents', 'teachers'],
      publishAt: daysAgo(3, 10),
      expiresAt: daysFromNow(30, 10),
    },
    {
      id: uid(NS.announcement, 2),
      madrasaId: MADRASA_ID,
      authorId: OWNER_ID,
      authorName: 'Ustadh Abdirahman Hassan',
      title: 'Term 2 fees now due',
      body: 'Term 2 invoices have been issued. You can pay directly in the app with M-Pesa.',
      audience: ['parents'],
      publishAt: daysAgo(18, 10),
      expiresAt: null,
    },
  ];

  const mail: MailItem[] = [
    {
      id: uid(NS.mail, 1),
      userId: PARENT_1_ID,
      kind: 'fee_overdue',
      title: 'Books and materials — payment overdue',
      preview: 'The invoice for books and materials was due 9 days ago.',
      body: 'Assalamu alaikum. The invoice for books and materials (KES 800) for Ahmed Abdi Mohamed was due 9 days ago. You can settle it in the app with M-Pesa in under a minute.',
      payload: { invoiceNo: 'INV-0003' },
      createdAt: daysAgo(2, 8),
      readAt: null,
      attachmentLabel: null,
    },
    {
      id: uid(NS.mail, 2),
      userId: PARENT_1_ID,
      kind: 'payment_receipt',
      title: 'Payment received — KES 3,500',
      preview: 'Receipt RCP-0001 for Term 2 tuition.',
      body: 'We have received your payment of KES 3,500 towards Term 2 tuition. Your receipt is attached.',
      payload: { receiptNo: 'RCP-0001' },
      createdAt: daysAgo(13, 12),
      readAt: daysAgo(13, 13),
      attachmentLabel: 'Receipt PDF',
    },
    {
      id: uid(NS.mail, 3),
      userId: PARENT_1_ID,
      kind: 'progress_summary',
      title: "Ahmed's week in review",
      preview: 'Strongest rule: qalqalah. Needs work: madd.',
      body: 'Ahmed completed 4 recitations this week with an average score of 89. His strongest rule was qalqalah and the one to work on is madd. He is on pace to finish Juz 29 within three weeks.',
      payload: {},
      createdAt: daysAgo(5, 18),
      readAt: daysAgo(5, 19),
      attachmentLabel: null,
    },
    {
      id: uid(NS.mail, 4),
      userId: PARENT_1_ID,
      kind: 'attendance_alert',
      title: 'Abdirahman was marked absent',
      preview: 'Absent on the morning session.',
      body: 'Abdirahman Osman Farah was marked absent for the morning hifz session. If this was expected, no action is needed.',
      payload: {},
      createdAt: daysAgo(7, 9),
      readAt: null,
      attachmentLabel: null,
    },
    {
      id: uid(NS.mail, 5),
      userId: PARENT_1_ID,
      kind: 'announcement',
      title: 'Ramadan timetable',
      preview: 'Classes move to after Taraweeh during Ramadan.',
      body: 'Classes will move to after Taraweeh during Ramadan, starting 9:00 pm. Morning hifz sessions continue as normal.',
      payload: {},
      createdAt: daysAgo(3, 10),
      readAt: null,
      attachmentLabel: null,
    },
  ];

  const notifications: Notification[] = [
    {
      id: uid(NS.notification, 1),
      userId: OWNER_ID,
      type: 'parent_link_request',
      title: 'New parent link request',
      body: 'Ibrahim Sheikh wants to link to Amina Yusuf Barre.',
      createdAt: daysAgo(1, 8),
      readAt: null,
      deeplink: '/teacher/link-requests',
    },
    {
      id: uid(NS.notification, 2),
      userId: OWNER_ID,
      type: 'recitation_pending',
      title: '2 recitations awaiting review',
      body: 'Fatuma and Yusuf submitted recitations for As-Sajdah.',
      createdAt: daysAgo(1, 20),
      readAt: null,
      deeplink: '/teacher/review',
    },
  ];

  const certificates: Certificate[] = [
    {
      id: uid(NS.certificate, 1),
      studentId: firstStudent.id,
      studentName: firstStudent.fullName,
      kind: 'juz_completion',
      title: 'Completion of Juz 30',
      issuedAt: daysAgo(60),
      verificationCode: 'DM-VRF-8K3M-2QX9',
      pdfUrl: null,
    },
    {
      id: uid(NS.certificate, 2),
      studentId: secondStudent.id,
      studentName: secondStudent.fullName,
      kind: 'juz_completion',
      title: 'Completion of Juz 29',
      issuedAt: daysAgo(31),
      verificationCode: 'DM-VRF-5T7P-1LC4',
      pdfUrl: null,
    },
  ];

  const audit: AuditEntry[] = [
    {
      id: uid(NS.audit, 1),
      actorId: OWNER_ID,
      actorName: 'Ustadh Abdirahman Hassan',
      actorRole: 'teacher',
      madrasaId: MADRASA_ID,
      action: 'invoice.issued',
      entityType: 'invoice',
      entityId: uid(NS.invoice, 1),
      createdAt: daysAgo(20),
      ip: '41.90.0.1',
    },
    {
      id: uid(NS.audit, 2),
      actorId: OWNER_ID,
      actorName: 'Ustadh Abdirahman Hassan',
      actorRole: 'teacher',
      madrasaId: MADRASA_ID,
      action: 'parent_link.approved',
      entityType: 'parent_student_link',
      entityId: uid(NS.link, 1),
      createdAt: daysAgo(147),
      ip: '41.90.0.1',
    },
  ];

  // ---------------------------------------------------------- subscription
  const PLAN_ID = uid(NS.plan, 1);
  const SUBSCRIPTION_ID = uid(NS.subscription, 1);

  const plans: SubscriptionPlan[] = [
    {
      id: PLAN_ID,
      code: 'madrasa_monthly',
      name: 'Madrasa Monthly',
      amount: SUBSCRIPTION_PRICE,
      currency: SUBSCRIPTION_CURRENCY,
      interval: 'monthly',
      trialDays: TRIAL_DAYS,
      features: [
        'Unlimited students and teachers',
        'Hifz tracking and AI tajweed feedback',
        'Attendance, grades and report cards',
        'Fee collection via M-Pesa and card',
        'Parent accounts and messaging',
        'Data export',
      ],
      isActive: true,
    },
  ];

  // The demo madrasa is 8 days into its trial: far enough in to show the
  // countdown, not so far that the urgent state is the only one visible.
  const trialEndsAt = daysFromNow(TRIAL_DAYS - 8, 9);

  const subscriptions: Subscription[] = [
    {
      id: SUBSCRIPTION_ID,
      madrasaId: MADRASA_ID,
      planId: PLAN_ID,
      plan: plans[0]!,
      status: 'trialing',
      trialEndsAt,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceEndsAt: null,
      cancelledAt: null,
      cancelAtPeriodEnd: false,
      defaultCard: null,
    },
  ];

  // The first month's invoice is issued up front and falls due when the trial
  // ends, so the owner can see exactly what they will owe and when.
  const subInvoices: SubscriptionInvoice[] = [
    {
      id: uid(NS.subInvoice, 1),
      madrasaId: MADRASA_ID,
      subscriptionId: SUBSCRIPTION_ID,
      invoiceNo: `DMS-${YEAR}-0001`,
      amountDue: SUBSCRIPTION_PRICE,
      amountPaid: 0,
      currency: SUBSCRIPTION_CURRENCY,
      periodStart: trialEndsAt,
      periodEnd: daysFromNow(TRIAL_DAYS - 8 + 30, 9),
      dueDate: trialEndsAt.slice(0, 10),
      status: 'issued',
      issuedAt: daysAgo(8),
    },
  ];

  const subPayments: SubscriptionPayment[] = [];
  const savedCards: SavedCard[] = [];

  const featureFlags: Record<string, FeatureFlags> = {
    [MADRASA_ID]: {
      aiEvaluation: true,
      payments: true,
      leaderboard: false,
      offlineMode: true,
      smsFallback: true,
    },
  };

  return {
    profiles,
    madrasas: [madrasa],
    students,
    teachers,
    classes,
    links,
    lessons,
    assignments,
    submissions,
    hifz,
    recitations,
    attendance,
    grades,
    feeStructures,
    invoices,
    payments,
    threads,
    messages,
    announcements,
    mail,
    notifications,
    certificates,
    audit,
    plans,
    subscriptions,
    subInvoices,
    subPayments,
    savedCards,
    featureFlags,
    admissionCounters: { [YEAR - 1]: 8, [YEAR]: 8 },
    credentials: [
      { email: 'owner@annur.example', password: 'Madrasa2026!', profileId: OWNER_ID },
      { email: 'fatuma@annur.example', password: 'Madrasa2026!', profileId: TEACHER_2_ID },
      { email: 'parent@example.com', password: 'Madrasa2026!', profileId: PARENT_1_ID },
      {
        email: `${firstStudent.admissionNo.toLowerCase()}@annur.example`,
        password: 'Madrasa2026!',
        profileId: firstStudent.profileId,
      },
    ],
  };
}

/**
 * Credentials shown on the sign-in screen so the app can be explored without a
 * backend. The student address is derived from the same admission-number rule
 * the seed uses, so it stays correct as the year rolls over.
 */
export const DEMO_ACCOUNTS = {
  owner: { email: 'owner@annur.example', password: 'Madrasa2026!' },
  teacher: { email: 'fatuma@annur.example', password: 'Madrasa2026!' },
  parent: { email: 'parent@example.com', password: 'Madrasa2026!' },
  student: {
    email: `${admissionNo(YEAR - 1, 1).toLowerCase()}@annur.example`,
    password: 'Madrasa2026!',
  },
} as const;
