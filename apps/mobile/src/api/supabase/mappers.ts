import type { Madrasa, Profile, Student, Teacher } from '@digital-madrasa/shared';

/**
 * snake_case rows into the camelCase models the screens consume.
 *
 * Kept in one place so a column rename shows up as a handful of type errors
 * here rather than as `undefined` scattered through the UI.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function mapProfile(row: Row): Profile {
  return {
    id: row.id,
    role: row.role,
    madrasaId: row.madrasa_id ?? null,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_url ?? null,
    locale: row.locale ?? 'en',
    isActive: row.is_active ?? true,
    // Server-set and read-only here. RLS forbids a user changing their own.
    isPlatformAdmin: row.is_platform_admin ?? false,
    createdAt: row.created_at,
  };
}

export function mapMadrasa(row: Row): Madrasa {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    county: row.county,
    town: row.town,
    ownerId: row.owner_id,
    logoUrl: row.logo_url ?? null,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    timezone: row.timezone ?? 'Africa/Nairobi',
    status: row.status,
    // Aggregates, supplied by the caller's query when it counts them.
    studentCount: row.student_count ?? 0,
    teacherCount: row.teacher_count ?? 0,
    createdAt: row.created_at,
  };
}

export function mapStudent(row: Row): Student {
  const joined = row.profiles ?? {};
  return {
    id: row.id,
    profileId: row.profile_id,
    madrasaId: row.madrasa_id,
    fullName: joined.full_name ?? row.full_name ?? '',
    admissionNo: row.admission_no,
    admissionYear: row.admission_year,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    classId: row.class_id ?? null,
    className: row.classes?.name ?? null,
    enrollmentStatus: row.enrollment_status,
    guardianNotes: row.guardian_notes ?? null,
    avatarUrl: joined.avatar_url ?? null,
    createdAt: row.created_at,
  };
}

export function mapTeacher(row: Row): Teacher {
  const joined = row.profiles ?? {};
  return {
    id: row.id,
    profileId: row.profile_id,
    madrasaId: row.madrasa_id,
    fullName: joined.full_name ?? '',
    email: joined.email ?? '',
    phone: joined.phone ?? null,
    avatarUrl: joined.avatar_url ?? null,
    employeeNo: row.employee_no,
    specialisation: row.specialisation ?? null,
    qiraahStyles: row.qiraah_styles ?? [],
    isOwner: row.is_owner ?? false,
    status: row.status ?? 'active',
    // From the embedded aggregate, which inherits the parent row's RLS.
    classCount: row.classes?.[0]?.count ?? 0,
  };
}
