/**
 * Every TanStack Query key in one place, so invalidation after a mutation is a
 * lookup rather than a guess.
 */
export const qk = {
  session: ['session'] as const,

  adminOverview: () => ['admin', 'overview'] as const,
  adminMadrasas: () => ['admin', 'madrasas'] as const,
  adminAudit: (madrasaId?: string) => ['admin', 'audit', madrasaId ?? 'all'] as const,

  students: (params?: Record<string, unknown>) => ['students', params ?? {}] as const,
  student: (id: string) => ['student', id] as const,
  classes: () => ['classes'] as const,
  teachers: () => ['teachers'] as const,

  lessons: (classId?: string | null) => ['lessons', classId ?? 'all'] as const,
  assignments: (classId?: string | null) => ['assignments', classId ?? 'all'] as const,
  submissions: (assignmentId: string) => ['submissions', assignmentId] as const,
  mySubmission: (assignmentId: string) => ['my-submission', assignmentId] as const,

  attendance: (classId: string, date: string) => ['attendance', classId, date] as const,
  grades: (params: Record<string, unknown>) => ['grades', params] as const,

  recitations: (params: Record<string, unknown>) => ['recitations', params] as const,
  recitation: (id: string) => ['recitation', id] as const,
  hifz: (studentId: string) => ['hifz', studentId] as const,

  linkRequests: (status?: string) => ['link-requests', status ?? 'all'] as const,
  children: () => ['children'] as const,
  childOverview: (studentId: string) => ['child-overview', studentId] as const,

  feeStructures: () => ['fee-structures'] as const,
  invoices: (params: Record<string, unknown>) => ['invoices', params] as const,
  feesSummary: () => ['fees-summary'] as const,
  childBalances: () => ['child-balances'] as const,
  payments: (params: Record<string, unknown>) => ['payments', params] as const,
  paymentStatus: (checkoutRequestId: string) => ['payment-status', checkoutRequestId] as const,

  subscription: () => ['subscription'] as const,
  subscriptionInvoices: () => ['subscription-invoices'] as const,
  subscriptionPayments: () => ['subscription-payments'] as const,
  subscriptionPaymentStatus: (checkoutRequestId: string) =>
    ['subscription-payment-status', checkoutRequestId] as const,
  savedCards: () => ['saved-cards'] as const,

  announcements: () => ['announcements'] as const,
  mail: () => ['mail'] as const,
  threads: () => ['threads'] as const,
  messages: (threadId: string) => ['messages', threadId] as const,
  notifications: () => ['notifications'] as const,
  notificationPrefs: () => ['notification-prefs'] as const,

  teacherDashboard: () => ['teacher-dashboard'] as const,
  studentDashboard: () => ['student-dashboard'] as const,
  search: (query: string) => ['search', query] as const,
  certificates: (studentId: string) => ['certificates', studentId] as const,
  qrToken: (classId: string) => ['qr-token', classId] as const,
} as const;
