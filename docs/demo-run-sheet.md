# Demo run sheet: the ten new features

All accounts use the password `Madrasa2026!`. The APK talks to the live Supabase project.

| # | Feature | Sign in as | Where |
|---|---------|------------|-------|
| 1 | Certificate PDF with a QR code anyone can scan | `owner@annur.example` | Students → a pupil → Award certificate → open it → **Certificate PDF**. Scan the QR with any phone camera: it opens the public verify page. |
| 2 | Sabaq · Sabqi · Manzil daily plan | any role | Student dashboard, parent's child page, teacher's pupil page: **Today's hifz plan**. |
| 3 | Tajweed mistake map | `owner@annur.example` | More → **Mistake map**. Tap a rule to filter; tap a square for the rules behind it. |
| 4 | Hijri date and Ramadan greeting | any role | The dashboard subtitle (e.g. *21 Rabi al-Thani 1448 AH*). |
| 5 | USSD for feature phones | (none) | Africa's Talking simulator; see `docs/ussd-setup.md`. Use the demo parent number `+254712000103`. |
| 6 | Spoken report in four languages | `parent@example.com` | A child → Progress → **Listen to the report**. Pick Kiswahili or Soomaali. It takes about 15 seconds to prepare. |
| 7 | Sponsor a pupil (sadaqah) | `owner@annur.example`, then `parent@example.com` | Teacher: a pupil → **Sponsorship** → tick guardian agreement → List. Parent: More → **Sponsor a pupil**. Use M-Pesa number `0712349999` to show a declined payment without moving money. |
| 8 | Ijazah with the teacher's sanad | `owner@annur.example` | More → **My chain of transmission** → save a chain, then award an *Ijazah*. The verify page prints the chain. |
| 9 | Co-pilot insights | `owner@annur.example` | Teacher dashboard → **Co-pilot: this week**. Tap a line to open the pupil. |
| 10 | Recite along | a student account | Recite tab → **Recite along** → Al-Ikhlas → Start reciting. Words turn green as they are heard. |

## Before the demo

- **Mistake map (3)**: it counts assessed recitations only. On the live project there is just one recitation, and it is unassessed, so the map is empty until a few pupils (with AI consent on) submit recitations. The web demo (mock mode) has a full map.
- **Sponsorship (7)**: nobody is listed on the live project. List one pupil from the teacher account first, then switch to the parent.
- **Recite along (10)**: use a real phone or the emulator with a microphone. It works on the phone (no internet) on Android 13+ with the Arabic offline speech pack. Otherwise it uses Google's speech service, which it only offers when the parent has turned on AI feedback.
- **Voice report (6)** and **recite along (10)**: the room needs to hear the phone; turn the volume up.

## What to say when asked "is it real?"

- Every insight, plan and spoken sentence is built from the pupil's records with rules that are unit-tested. The only AI-generated part of the voice report is the voice itself.
- Recite-along is practice: nothing is recorded or scored, and a "missed" word may simply not have been heard.
- Sponsors never see a pupil's name or photo, and the family is never told who paid. The database enforces both, and `npm run db:verify:sponsorship` checks them.
