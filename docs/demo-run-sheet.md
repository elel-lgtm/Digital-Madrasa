# ILMORA demo run sheet

ILMORA is the branded implementation of the Digital Madrasa Mobile Application. This sheet is for the person running the panel demo.

All demo accounts use the password `Madrasa2026!`. The APK talks to the live server.

| Role | Email |
|------|-------|
| Owner / teacher | `owner@annur.example` |
| Class teacher | `fatuma@annur.example` |
| Parent | `parent@example.com` |
| Pupil | `aisha.hassan@annur.example` |

## Before the day

1. **Install the latest APK** on the demo phone (and a second phone for the live reading room).
2. **M-Pesa is on Safaricom's sandbox.** Bring a Safaricom phone with signal; the real PIN prompt pops up on it. Test money only.
3. **Record 3 or 4 real recitations** as pupils with AI consent on, so the mistake map and tajweed feedback have something to show. The live server has none yet, and none are faked.
4. **Schedule the live session** a few minutes before you present: Owner → More → Lessons → **Schedule a live session**, class *Hifz Level 1*, today, a time 5–10 minutes ahead, and a Google Meet link you created. The class and parents get an inbox notice.
5. Run `npm run security:report` the day before and keep `docs/security-report.html` open in a browser tab.
6. Turn the phone volume up (voice report, master reciter, recite-along).

## Suggested order (about 15 minutes)

| # | What to show | Account | Where |
|---|--------------|---------|-------|
| 1 | **Brand and languages:** splash, ILMORA logo, switch to Kiswahili, Somali, Arabic (right-to-left) | — | Welcome screen, language chips |
| 2 | **Hijri date** in every dashboard header | any | Dashboard |
| 3 | **Co-pilot insights:** who is stuck, falling behind or improving | Owner | Dashboard → *Co-pilot: this week* |
| 4 | **Live session + live reading room:** pupils raise hands, teacher picks a reader, ayah lights up on every phone, teacher marks the reading | Owner + Pupil (two phones) | Dashboard → *Open the live reading room* (both phones). Video and sound: *Join on Google Meet* |
| 5 | **Recitation, AI tajweed feedback, master reciter:** play the pupil, then the qari, ayah by ayah | Owner | Recitations to review → a recitation → *Compare with a master reciter*; *Hear ayah N correctly* on a mistake |
| 6 | **Mistake map** across the class | Owner | More → *Mistake map* |
| 7 | **Daily hifz plan:** sabaq, sabqi, manzil | Pupil | Dashboard |
| 8 | **Recite along:** words light up as the pupil recites | Pupil | Recite tab → *Recite along* → Al-Ikhlas |
| 9 | **Qur'an video library:** teacher-chosen YouTube videos | Pupil | Learn tab → *Qur'an videos* |
| 10 | **Offline attendance:** airplane mode, mark the register, back online, it syncs | Owner | Classes → Hifz Level 1 → *Mark attendance* |
| 11 | **Real M-Pesa payment:** PIN prompt on the Safaricom phone, receipt with Safaricom's code, shareable PDF | Parent | Fees → *Pay now* (enter the Safaricom number) |
| 12 | **Sponsor a pupil (sadaqah):** anonymous both ways | Parent | More → *Sponsor a pupil* |
| 13 | **Spoken report** in Kiswahili or Somali | Parent | A child → Progress → *Listen to the report* |
| 14 | **Parent ↔ teacher messaging** | Parent, then Fatuma | Messages → *New message* |
| 15 | **Certificates with QR, ijazah with sanad:** scan the QR with any phone | Owner | A pupil → Award certificate → *Certificate PDF* |
| 16 | **Impact dashboard** | Owner | More → *Impact* |
| 17 | **Security proof:** 21 suites, 145 guarantees | — | `docs/security-report.html` |
| 18 | **USSD for feature phones** | — | Africa's Talking simulator; see `docs/ussd-setup.md` |

## If something goes wrong

- **No internet in the room:** M-Pesa sandbox, voice report, master reciter, videos and messaging need a connection. Everything already opened keeps showing (offline banner), and attendance still works. As a fallback for payments, switch the server to the simulator: `npx supabase secrets set MPESA_ENV=mock --project-ref rblnistltccysizdcnvt` (numbers ending 9999, 8888, 7777 and 6666 show each failure). Switch back with `MPESA_ENV=sandbox`.
- **Recite-along does not hear the pupil:** it uses the phone's Arabic speech recogniser; on the phone it needs the Arabic offline pack, otherwise Google's service (only if AI consent is on). Say plainly that it is practice, not marking.
- **A screen looks stuck:** pull down to refresh.

## What to say when asked "is it real?"

- **M-Pesa** is Safaricom's own sandbox: the prompt, the PIN and the transaction code are Safaricom's. Going live needs a registered Paybill or Till; no code changes.
- **Live video** runs in Google Meet or Zoom beside the in-app reading room. In-app video is built but switched off until a funded video account is set up.
- **AI** is used where it helps (tajweed assessment, the assistant, the spoken voice) and never decides a mark: the teacher's review is final, and no child's recording is assessed without a parent's consent.
- **Security** is enforced in the database for every user, and checked by 21 test suites against the live system.
