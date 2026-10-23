# @digital-madrasa/shared

Types, validation schemas and pure logic shared by the mobile app, the Edge Functions and the AI gateway, so every part of the system computes the same answer.

| Module | Purpose |
| --- | --- |
| `types.ts`, `database.types.ts` | Domain types and the generated database types |
| `schemas/` | Zod schemas for every form and request payload |
| `hifz.ts`, `hifzPlan.ts` | Memorisation totals by juz and the daily Sabaq, Sabqi and Manzil plan |
| `achievements.ts` | Streaks and badges, worked out from the pupil's records |
| `heatmap.ts`, `insights.ts` | The class mistake map and the teacher's weekly insights |
| `mpesa.ts`, `billing.ts` | Kenyan phone numbers, M-Pesa codes and failures, subscription billing |
| `halaqa.ts`, `masterReciter.ts`, `reciteAlong.ts` | The live reading room, master-reciter audio and recite-along matching |
| `voiceReport.ts`, `youtube.ts`, `meetings.ts` | Spoken progress reports, video links and live-session links |
| `hijri.ts`, `quran.ts`, `format.ts` | Hijri dates, Quran surah data and formatting helpers |

Every module with logic has a `*.test.ts` beside it; run them all with `npm test` from the repository root.
