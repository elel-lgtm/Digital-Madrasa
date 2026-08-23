import { z } from 'zod';
import { plainTextSchema, uuidSchema } from './common';

export const sendMessageSchema = z.object({
  threadId: uuidSchema.nullish(),
  recipientId: uuidSchema,
  body: plainTextSchema(2000).pipe(z.string().min(1, 'validation.message_empty')),
  attachmentUrl: z.string().url().nullish(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const createAnnouncementSchema = z.object({
  title: plainTextSchema(120).pipe(z.string().min(3, 'validation.title_too_short')),
  body: plainTextSchema(4000).pipe(z.string().min(1, 'validation.body_required')),
  audience: z
    .array(z.enum(['students', 'parents', 'teachers']))
    .min(1, 'validation.audience_required'),
  publishAt: z.string().datetime().nullish(),
  expiresAt: z.string().datetime().nullish(),
});
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const NOTIFICATION_CATEGORIES = [
  'fees',
  'attendance',
  'grades',
  'announcements',
  'messages',
  'progress',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ['push', 'email', 'sms', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Parents control channels per category; in-app can never be turned off. */
export const notificationPreferencesSchema = z.record(
  z.enum(NOTIFICATION_CATEGORIES),
  z.object({
    push: z.boolean(),
    email: z.boolean(),
    sms: z.boolean(),
  }),
);
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const reportProblemSchema = z.object({
  category: z.enum(['bug', 'payment', 'account', 'content', 'other']),
  description: plainTextSchema(2000).pipe(z.string().min(10, 'validation.description_too_short')),
  includeDiagnostics: z.boolean().default(true),
});
export type ReportProblemInput = z.infer<typeof reportProblemSchema>;
