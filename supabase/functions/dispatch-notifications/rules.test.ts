import { describe, expect, it } from 'vitest';
import { categoryOf, channelsFor, toE164 } from './rules';

const all = ['in_app', 'push', 'email', 'sms'];

describe('notification channel rules', () => {
  it('maps notification types to preference switches', () => {
    expect(categoryOf('fee_due')).toBe('fees');
    expect(categoryOf('payment_receipt')).toBe('fees');
    expect(categoryOf('attendance_alert')).toBe('attendance');
    expect(categoryOf('grade_posted')).toBe('grades');
    expect(categoryOf('announcement')).toBe('announcements');
    expect(categoryOf('message')).toBe('messages');
    expect(categoryOf('certificate_issued')).toBe('progress');
    expect(categoryOf('link_approved')).toBeNull();
  });

  it('uses the defaults when the user has saved no preferences', () => {
    // fees: push, email and SMS all on by default
    expect(channelsFor({ type: 'fee_due', channel: all }, null)).toEqual(['push', 'email', 'sms']);
    // announcements: push only by default
    expect(channelsFor({ type: 'announcement', channel: all }, null)).toEqual(['push']);
  });

  it('honours a switch the user turned off, and only that one', () => {
    const prefs = { fees: { email: false } };
    expect(channelsFor({ type: 'fee_due', channel: all }, prefs)).toEqual(['push', 'sms']);
  });

  it('never adds a channel the notification did not ask for', () => {
    const prefs = { fees: { push: true, email: true, sms: true } };
    expect(channelsFor({ type: 'payment_receipt', channel: ['in_app'] }, prefs)).toEqual([]);
    expect(channelsFor({ type: 'message', channel: ['push'] }, prefs)).toEqual(['push']);
  });

  it('sends account events on every requested channel, whatever the switches', () => {
    const prefs = { fees: { push: false, email: false, sms: false } };
    expect(channelsFor({ type: 'link_approved', channel: ['push', 'email'] }, prefs)).toEqual(['push', 'email']);
  });

  it('ignores unknown channel names', () => {
    expect(channelsFor({ type: 'link_request', channel: ['fax', 'push'] }, null)).toEqual(['push']);
  });

  it('normalises Kenyan numbers for SMS and rejects anything else', () => {
    expect(toE164('0712345678')).toBe('+254712345678');
    expect(toE164('+254 712 345 678')).toBe('+254712345678');
    expect(toE164('254112345678')).toBe('+254112345678');
    expect(toE164('0612345678')).toBeNull();
    expect(toE164('12345')).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});
