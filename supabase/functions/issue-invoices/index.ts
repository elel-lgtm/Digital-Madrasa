import { authenticate, requireActiveSubscription, requireStaff } from '../_shared/auth.ts';
import { writeAudit } from '../_shared/audit.ts';
import { handler, json, PublicError, readJson } from '../_shared/http.ts';
import { LIMITS, rateLimit } from '../_shared/rate-limit.ts';

/**
 * Issues invoices for a fee structure, to an explicitly named target.
 *
 * This is server-side for one reason: invoice numbers must be unique and
 * gapless per madrasa. A client computing `count + 1` races with every other
 * client doing the same, and duplicate invoice numbers are the kind of thing
 * that surfaces months later during a reconciliation nobody can complete.
 * The allocation happens in a single statement holding a row lock.
 *
 * Amounts come from the fee structure, never from the request — a tampered
 * payload cannot issue a child a one-shilling invoice.
 *
 * The target must be stated. An earlier revision treated an absent target as
 * "every student", and the screen never sent one, so the only thing the button
 * could do was bill the whole madrasa. Worse, a fee structure scoped to a
 * single student took that same path: the narrowest target the schema can
 * express produced the broadest possible billing run. Both are refused here
 * now — `resolveTarget` has no fall-through.
 */

type Scope = 'student' | 'class' | 'madrasa';

interface Body {
  feeStructureId?: string;
  scope?: Scope;
  studentId?: string;
  classId?: string;
  dueDate?: string;
  /** Resolve and count the target without issuing anything. */
  preview?: boolean;
}

interface Structure {
  id: string;
  name: string;
  amount: number;
  currency: string | null;
  applies_to: Scope | 'all';
  class_id: string | null;
  student_id: string | null;
  term: string;
  academic_year: number;
}

/**
 * A student is billable only while they are enrolled. Graduating or
 * withdrawing does not delete the record — it is kept for their history — so
 * without this filter a batch invoices people who left. The mock API has
 * always applied it; the server did not, which meant the two disagreed about
 * who the product bills.
 */
const BILLABLE = 'active';

/**
 * Turns the requested scope into the set of students to bill.
 *
 * Every branch narrows explicitly and the function throws if none matches, so
 * there is no path that quietly means "everyone". The roster is read through
 * the caller's own client, so RLS decides membership: a student id or class id
 * belonging to another madrasa resolves to nothing rather than to a row.
 */
async function resolveTarget(
  caller: Awaited<ReturnType<typeof authenticate>>,
  structure: Structure,
  body: Body,
): Promise<{ scope: Scope; students: { id: string }[]; classId: string | null }> {
  // The structure's own scope binds the request. A fee that exists for one
  // class cannot be turned into a madrasa-wide charge by asking for it.
  const scope = body.scope;
  if (!scope) throw new PublicError(400, 'validation', 'Choose who to bill.');

  if (structure.applies_to === 'class' && scope !== 'class') {
    throw new PublicError(400, 'scope_mismatch', 'That fee belongs to one class.');
  }
  if (structure.applies_to === 'student' && scope !== 'student') {
    throw new PublicError(400, 'scope_mismatch', 'That fee belongs to one student.');
  }

  const roster = () =>
    caller.db
      .from('students')
      .select('id')
      .is('deleted_at', null)
      .eq('enrollment_status', BILLABLE);

  if (scope === 'student') {
    // A structure scoped to a student names its own target; anything else the
    // caller asks for is ignored in favour of it.
    const studentId = structure.applies_to === 'student' ? structure.student_id : body.studentId;
    if (!studentId) throw new PublicError(400, 'validation', 'Choose a student.');

    const { data } = await roster().eq('id', studentId);
    if (!data?.length) {
      throw new PublicError(404, 'not_found', 'That student is not enrolled here.');
    }
    return { scope, students: data, classId: null };
  }

  if (scope === 'class') {
    const classId = structure.applies_to === 'class' ? structure.class_id : body.classId;
    if (!classId) throw new PublicError(400, 'validation', 'Choose a class.');

    // Checked separately from the roster: a class with no enrolled students is
    // a different answer from a class that is not this madrasa's, and the
    // caller should not be told the latter looks like the former.
    const { data: klass } = await caller.db
      .from('classes')
      .select('id')
      .eq('id', classId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!klass) throw new PublicError(404, 'not_found', 'That class was not found.');

    const { data } = await roster().eq('class_id', classId);
    return { scope, students: data ?? [], classId };
  }

  if (scope === 'madrasa') {
    if (structure.applies_to !== 'all') {
      throw new PublicError(400, 'scope_mismatch', 'That fee does not apply to everyone.');
    }
    const { data } = await roster();
    return { scope, students: data ?? [], classId: null };
  }

  throw new PublicError(400, 'validation', 'Unknown billing target.');
}

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new PublicError(405, 'method', 'POST required.');

  const caller = await authenticate(req);
  const teacher = await requireStaff(caller);
  const madrasaId = teacher.madrasa_id as string;

  const body = await readJson<Body>(req);
  const preview = body.preview === true;

  // A preview writes nothing, so it is not spent against the issuing budget —
  // otherwise moving back and forth in the review step would exhaust the
  // allowance before the user ever committed.
  if (!preview) {
    await rateLimit(caller.admin, `issue-invoices:${caller.userId}`, LIMITS.issueInvoices);
  }
  await requireActiveSubscription(caller, madrasaId);

  if (!body.feeStructureId) {
    throw new PublicError(400, 'validation', 'Choose a fee structure.');
  }

  // Read the structure as the caller: another madrasa's is invisible.
  const { data: structure } = await caller.db
    .from('fee_structures')
    .select('id, name, amount, currency, applies_to, class_id, student_id, term, academic_year')
    .eq('id', body.feeStructureId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!structure) throw new PublicError(404, 'not_found', 'That fee structure was not found.');

  const target = await resolveTarget(caller, structure as Structure, body);
  const studentIds = target.students.map((s) => s.id);

  // Which of them the run would skip. The rule itself lives in
  // `issue_invoices_for_students` and is not restated here — this only asks
  // the same question ahead of time so the total shown before confirming is
  // the total that will actually be raised.
  const { data: billed } = await caller.db
    .from('invoices')
    .select('student_id')
    .eq('fee_structure_id', structure.id)
    .neq('status', 'void')
    .in('student_id', studentIds.length ? studentIds : ['00000000-0000-0000-0000-000000000000']);

  const alreadyBilled = new Set((billed ?? []).map((r) => r.student_id as string));
  const toIssue = studentIds.filter((id) => !alreadyBilled.has(id));
  const amount = Number(structure.amount);

  const summary = {
    scope: target.scope,
    eligible: studentIds.length,
    alreadyBilled: alreadyBilled.size,
    toIssue: toIssue.length,
    amount,
    currency: structure.currency ?? 'KES',
    total: amount * toIssue.length,
  };

  if (preview) return json(summary, 200);

  if (!toIssue.length) {
    // Not an error: the batch is simply already raised. Saying so is more use
    // than a success screen reporting zero.
    return json({ ...summary, created: 0, invoices: [] }, 200);
  }

  const dueDate = body.dueDate ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  const { data: created, error } = await caller.admin.rpc('issue_invoices_for_students', {
    p_madrasa_id: madrasaId,
    p_fee_structure_id: structure.id,
    p_student_ids: toIssue,
    p_due_date: dueDate,
    p_description: `${structure.name} — ${structure.term} ${structure.academic_year}`,
  });

  if (error) {
    console.error('[issue-invoices]', error);
    throw new PublicError(500, 'internal', 'Could not issue the invoices.');
  }

  // The numbers the run allocated, read back rather than reconstructed: the
  // sequence belongs to the database and a client must never print a number
  // it guessed. Only students that had none before are queried, so nothing
  // raised by an earlier run is reported as this run's work.
  const { data: rows } = await caller.db
    .from('invoices')
    .select('invoice_no, amount_due, due_date, student_id, students(profiles(full_name))')
    .eq('fee_structure_id', structure.id)
    .in('student_id', toIssue)
    .order('invoice_no', { ascending: true });

  const invoices = (rows ?? []).map((row) => {
    const student = row.students as { profiles?: { full_name?: string } } | null;
    return {
      invoiceNo: row.invoice_no as string,
      studentName: student?.profiles?.full_name ?? '',
      amount: Number(row.amount_due),
      dueDate: row.due_date as string,
    };
  });

  await writeAudit(caller.admin, {
    actorId: caller.userId,
    actorRole: caller.role,
    madrasaId,
    action: 'invoices.issued',
    entityType: 'fee_structure',
    entityId: structure.id,
    after: {
      count: created,
      amount: structure.amount,
      due_date: dueDate,
      scope: target.scope,
      class_id: target.classId,
      student_ids: toIssue,
    },
    req,
  });

  // Tell each child's linked parents there is something to pay. Only the
  // families actually invoiced by this run.
  const { data: links } = await caller.admin
    .from('parent_student_links')
    .select('parent_id, parents(profile_id)')
    .in('student_id', toIssue)
    .eq('status', 'approved');

  const parentProfiles = [
    ...new Set(
      (links ?? [])
        .map((l) => (l as { parents?: { profile_id?: string } }).parents?.profile_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (parentProfiles.length) {
    await caller.admin.from('notifications').insert(
      parentProfiles.map((profileId) => ({
        user_id: profileId,
        madrasa_id: madrasaId,
        type: 'fee_due',
        title: 'New invoice issued',
        body: `${structure.name} is now due. You can pay in the app.`,
        channel: ['in_app', 'push', 'email'],
      })),
    );
  }

  return json({ ...summary, created: created ?? 0, invoices }, 201);
}));
