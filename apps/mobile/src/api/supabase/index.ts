import { ApiError, type ApiClient } from '../types';
import * as auth from './auth';
import { bindAuthRefreshToAppState } from './client';
import * as edge from './edge';
import * as m from './mutations';
import * as q from './queries';
import * as storage from './storage';
import * as c from './queries-comms';
import * as fees from './queries-fees';
import * as learning from './learning';
import * as admin from './admin';

export { supabase } from './client';

/**
 * The Supabase implementation of `ApiClient`.
 *
 * Anything not listed below is not yet ported and throws `not_implemented`
 * naming the method. That fallback is a Proxy rather than a hand-maintained
 * list of pending names: the list drifted almost immediately — nine methods
 * were missing from it, so instead of a clear message the app called
 * `undefined` and showed a generic "Something went wrong".
 *
 * With a Proxy the two can no longer disagree. A method is either implemented
 * here or it reports itself as unported, and adding one to `ApiClient` cannot
 * silently produce a crash.
 */

function notImplemented(name: string) {
  return async (): Promise<never> => {
    throw new ApiError(
      'not_implemented',
      `"${name}" is not available on Supabase yet. Switch EXPO_PUBLIC_API_MODE to "mock" to use it.`,
    );
  };
}

const implemented: Partial<ApiClient> = {
  // ---------------------------------------------------------------- auth
  getSession: auth.getSession,
  signIn: auth.signIn,
  signOut: auth.signOut,
  registerMadrasa: auth.registerMadrasa,
  registerParent: auth.registerParent,
  requestPasswordReset: auth.requestPasswordReset,
  verifyPasswordResetOtp: auth.verifyPasswordResetOtp,
  resetPassword: auth.resetPassword,
  updateProfile: auth.updateProfile,

  // ------------------------------------------------------ people & classes
  listStudents: q.listStudents,
  listClasses: q.listClasses,
  listTeachers: q.listTeachers,
  inviteTeacher: edge.inviteTeacher,
  getVoiceReport: edge.getVoiceReport,
  sponsorStudent: edge.sponsorStudent,
  listSponsorable: learning.listSponsorable,
  setSponsorship: learning.setSponsorship,

  // ------------------------------------------------------------- learning
  listLessons: q.listLessons,
  listAttendance: q.listAttendance,
  listGrades: q.listGrades,
  listHifzProgress: q.listHifzProgress,
  listAnnouncements: q.listAnnouncements,

  // --------------------------------------------------------------- parent
  listChildren: q.listChildren,
  getChildOverview: q.getChildOverview,
  getChildBalances: q.getChildBalances,

  // ----------------------------------------------------------- dashboards
  getTeacherDashboard: q.getTeacherDashboard,
  getStudentDashboard: q.getStudentDashboard,

  // ----------------------------------------------------- fees & payments
  listFeeStructures: fees.listFeeStructures,
  listInvoices: fees.listInvoices,
  getFeesSummary: fees.getFeesSummary,
  listPayments: fees.listPayments,
  createFeeStructure: m.createFeeStructure,
  previewInvoices: edge.previewInvoices,
  issueInvoices: edge.issueInvoices,

  // ---------------------------------------------------------- recitations
  listRecitations: fees.listRecitations,
  getRecitation: fees.getRecitation,
  createRecitation: edge.createRecitation,
  awaitTajweedFeedback: edge.awaitTajweedFeedback,
  saveTeacherOverride: m.saveTeacherOverride,
  getRecitationAudioUrl: storage.getRecitationAudioUrl,
  listCertificates: fees.listCertificates,
  issueCertificate: learning.issueCertificate,
  withdrawCertificate: learning.withdrawCertificate,
  setAiFeedbackConsent: learning.setAiFeedbackConsent,
  getMySanad: learning.getMySanad,
  getTajweedHeatmap: learning.getTajweedHeatmap,
  getTeacherSignals: learning.getTeacherSignals,
  setMySanad: learning.setMySanad,
  verifyCertificate: learning.verifyCertificate,
  upsertHifzProgress: learning.upsertHifzProgress,
  getMySubmission: learning.getMySubmission,
  submitAssignment: learning.submitAssignment,
  gradeSubmission: learning.gradeSubmission,
  getStudent: q.getStudent,

  // ------------------------------------------------ assignments & links
  listAssignments: c.listAssignments,
  listSubmissions: c.listSubmissions,
  listLinkRequests: c.listLinkRequests,

  // -------------------------------------------------------- communication
  listMail: c.listMail as ApiClient['listMail'],
  markMailRead: c.markMailRead,
  markAllMailRead: c.markAllMailRead,
  listThreads: c.listThreads,
  listMessages: c.listMessages,
  listNotifications: c.listNotifications,
  getNotificationPreferences: c.getNotificationPreferences,
  saveNotificationPreferences: c.saveNotificationPreferences,
  search: c.search,

  // ---------------------------------------------------------------- writes
  createClass: m.createClass,
  createStudent: edge.createStudent,
  createLesson: m.createLesson,
  setLessonMeetingUrl: m.setLessonMeetingUrl,
  createAssignment: m.createAssignment as ApiClient['createAssignment'],
  markAttendance: m.markAttendance,
  recordGrade: m.recordGrade,
  createAnnouncement: m.createAnnouncement,
  sendMessage: m.sendMessage,

  // ------------------------------------------- backed by Edge Functions
  linkChild: edge.linkChild,
  decideLinkRequest: edge.decideLinkRequest,
  revokeLink: edge.revokeLink,
  getAttendanceQrToken: edge.getAttendanceQrToken,
  markAttendanceByQr: edge.markAttendanceByQr,

  // ----------------------------------------------------------- subscription
  getSubscription: m.getSubscription,
  listSubscriptionInvoices: m.listSubscriptionInvoices,
  listSubscriptionPayments: m.listSubscriptionPayments,
  cancelSubscription: m.cancelSubscription,
  resumeSubscription: m.resumeSubscription,
  startSubscriptionPayment: edge.startSubscriptionPayment,
  getSubscriptionPaymentStatus: edge.getSubscriptionPaymentStatus,
  listSavedCards: m.listSavedCards,
  removeSavedCard: m.removeSavedCard,
  setDefaultCard: m.setDefaultCard,

  // ------------------------------------------------------- platform admin
  getAdminOverview: admin.getAdminOverview,
  listAdminMadrasas: admin.listAdminMadrasas,
  listAdminAudit: admin.listAdminAudit,
  changeMadrasaStatus: admin.changeMadrasaStatus,

  // ------------------------------------------------------------------ push
  registerPushToken: m.registerPushToken,
  unregisterPushToken: m.unregisterPushToken,

  // ------------------------------------------------ fee payments (M-Pesa)
  payFees: edge.payFees,
  initiatePayment: edge.initiatePayment,
  getPaymentStatus: edge.getPaymentStatus,
};

bindAuthRefreshToAppState();

export const supabaseApi = new Proxy(implemented as ApiClient, {
  get(target, property, receiver) {
    const existing = Reflect.get(target, property, receiver) as unknown;
    if (existing !== undefined) return existing;
    // Symbols are React/JS internals (Symbol.toPrimitive and friends), not
    // API calls — returning a thrower for them would break rendering.
    if (typeof property === 'symbol') return undefined;
    return notImplemented(property);
  },
}) as ApiClient;
