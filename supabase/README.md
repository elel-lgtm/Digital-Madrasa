# Supabase backend

The database, its security rules, the server functions and the tests that prove them.

| Path | Contents |
| --- | --- |
| `migrations/` | 41 numbered SQL migrations: tables, Row Level Security policies, database functions and triggers |
| `functions/` | 18 Edge Functions (Deno) for work that must happen on the server |
| `tests/` | 21 SQL verification suites; each runs inside a transaction that is rolled back |
| `seed/` | Reference data (Quran text) |

## Edge Functions

| Function | What it does |
| --- | --- |
| `create-student` | Enrols a pupil and creates the pupil's login; the database issues the admission number |
| `invite-teacher` | Adds a teacher to a madrasa (owner only) |
| `link-child`, `decide-link` | A parent's request to link to a child, and the madrasa's decision |
| `attendance-qr` | Signs and checks the rotating attendance QR code |
| `issue-invoices` | Issues numbered invoices for a fee structure to a madrasa, class or pupil |
| `payments`, `payment-callback`, `card-callback` | Starts M-Pesa and card payments and settles them when Safaricom or Paystack reports back |
| `evaluate-recitation` | Stores a recitation and produces tajweed feedback (only with a parent's consent) |
| `ai-assistant`, `voice-report` | The in-app assistant and spoken progress reports |
| `dispatch-notifications` | Delivers notifications by push, e-mail and SMS |
| `ussd` | The USSD menu for parents on basic phones |
| `verify` | The public page a certificate's QR code opens |
| `live-room` | In-app video for live lessons (switched off) |
| `madrasa-lifecycle` | The platform admin's suspend and delete controls |
| `health` | Health check for uptime monitoring |

## Working with it

```bash
npm run db:migrate          # apply the migrations (needs supabase/.env, see .env.example)
npm run db:verify           # run the core guarantees suite
npm run security:report     # run all 21 suites and write docs/security-report.html
```

Secrets (service-role key, M-Pesa, Gemini and messaging keys) live only in Supabase's Edge Function secrets and in the git-ignored `supabase/.env`.
