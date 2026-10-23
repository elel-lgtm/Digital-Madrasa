# ILMORA mobile app

The Expo (React Native) app used by madrasa owners, teachers, parents and pupils, and, in its web build, by the platform administrator.

## Run it

```bash
cp .env.example .env     # EXPO_PUBLIC_API_MODE=mock runs on built-in demo data
npm run start            # or, from the repository root: npm run mobile
```

Set `EXPO_PUBLIC_API_MODE=supabase` with a project URL and anon key to use a real backend. Only public values belong in `.env`; see the comments in `.env.example`.

## Layout

| Path | What lives there |
| --- | --- |
| `app/(auth)` | Welcome, sign-in, registration, password reset, certificate verification |
| `app/(teacher)` | Owner and teacher screens: dashboard, classes, students, fees, reviews, live lessons |
| `app/(parent)` | Parent screens: children, fees and receipts, inbox, messages |
| `app/(student)` | Pupil screens: hifz plan, recite, progress, learning |
| `app/(admin)` | Platform admin console (web only) |
| `src/api` | The API contract with two implementations: `mock` (demo data) and `supabase` (live) |
| `src/components` | UI primitives and feature components |
| `src/i18n` | English, Kiswahili, Somali and Arabic translations |
| `src/offline` | The outbox that keeps registers marked offline until they can be sent |
| `src/payments`, `src/halaqa`, `src/certificates` | M-Pesa and receipts, the live reading room, printable certificates |
| `src/theme` | Design tokens and the light and dark themes |

Screens never call Supabase directly: they go through `src/api`, so switching between the mock and the live backend changes one environment variable.
