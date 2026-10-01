# Digital Madrasa — Usability Test Kit

Everything needed to run the usability study reported in Chapter 7 (Table 7.13) of the project report. Plan for **5 participants per role** (owner, teacher, parent, student; 20 in total). Five users per group find most usability problems, and the System Usability Scale (SUS) gives a reliable score from that number. Each session takes about 20 minutes.

## 1. Before the sessions

- **Phone:** an Android phone with the latest APK installed (see the README), signed in to the matching test account:
  - owner: `owner@annur.example`
  - teacher: `fatuma@annur.example`
  - parent: `parent@example.com`
  - student: `aisha.hassan@annur.example`
- **Data:** test data only. Participants never use their own records.
- **Consent:** each participant (and a parent, for a student under 18) signs the consent note in section 5. Do not record faces or names. Write only the role and a participant number (P1, P2, …).
- **Materials:** a stopwatch, this sheet, and one copy of the SUS form (section 4) per participant.

## 2. Running a session

Read this aloud:

> "We are testing the app, not you. There are no wrong answers. Please think aloud as you go — say what you are looking for and what you expect to happen. I will not help unless you are stuck for two minutes."

For each task, record:
- **Completed:** yes, with help, or no.
- **Time:** seconds from "start" until done or given up.
- **Errors:** wrong taps or dead ends.
- **Comments:** anything the participant says.

Then hand over the SUS form.

## 3. Tasks

| # | Role | Task (read to the participant) | Done when |
|---|---|---|---|
| T1 | Owner | "Admit a new student called *Test Pupil* into Hifz Level 1, then find the admission number." | Admission number is on screen |
| T2 | Owner | "Send this term's tuition invoice to Hifz Level 1 only." | Review screen confirmed; invoice numbers shown |
| T3 | Teacher | "Take today's attendance for Hifz Level 1 using the QR code." | QR code displayed; a student scan recorded |
| T4 | Teacher | "Listen to the newest recitation and give it a score with a short comment." | Review saved |
| T5 | Parent | "Link your account to your child using the admission number." | Link request sent |
| T6 | Parent | "Pay your child's outstanding fees with M-Pesa." | Receipt number shown |
| T7 | Parent | "Turn on AI recitation feedback for your child." | Switch on |
| T8 | Student | "Record yourself reciting Surah Al-Ikhlas and find your feedback." | Feedback screen open |
| T9 | Student | "Download Juz 30 so you can read it without internet." | Juz shows as downloaded |

Each participant does the tasks for their own role (two or three tasks).

## 4. System Usability Scale (SUS)

Participants tick one box per statement: 1 = strongly disagree … 5 = strongly agree.

| # | Statement | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 1 | I think that I would like to use this app frequently. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | I found the app unnecessarily complex. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | I thought the app was easy to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | I think that I would need the support of a technical person to be able to use this app. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | I found the various functions in this app were well integrated. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | I thought there was too much inconsistency in this app. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | I would imagine that most people would learn to use this app very quickly. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | I found the app very cumbersome to use. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | I felt very confident using the app. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | I needed to learn a lot of things before I could get going with this app. | ☐ | ☐ | ☐ | ☐ | ☐ |

Source: Brooke (1996). Translate the statements for participants who prefer Kiswahili, Somali or Arabic, and keep the order.

## 5. Consent note

> I agree to take part in a short test of the Digital Madrasa app for a university project at Umma University. I will use test data only. My name will not be recorded, and I can stop at any time.
>
> Participant number: ______  Role: ______  Signature: ______________  Date: ________
>
> For a participant under 18, a parent or guardian signs: ______________

## 6. Turning results into the report

Enter each participant on one line of a CSV file, `usability-results.csv`:

```
participant,role,task,completed,seconds,errors,sus1,sus2,sus3,sus4,sus5,sus6,sus7,sus8,sus9,sus10
P1,owner,T1,yes,95,1,4,2,4,1,4,2,5,1,4,2
P1,owner,T2,with_help,210,3,,,,,,,,,,
```

Put the SUS answers on the participant's first line only. Then run:

```
npm run usability:score -- usability-results.csv
```

It prints, per task, the completion rate and median time, and, per role, the mean SUS score with its adjective rating. These figures go into Table 7.13 and the "Usability Testing" rows of Tables 7.1 and 7.4. A mean SUS of 68 is about average, and 80 or above is very good.
