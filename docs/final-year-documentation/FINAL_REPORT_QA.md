# Quality-assurance report: Digital_Madrasa_Final_Project_Report.docx

Prepared 16 October 2026. The final report combines:

- **Document A:** `Digital_Madrasa_Project_Documentation_updated.docx`, the latest content.
- **Document B:** `Digital_Madrasa_Project_Report_revised.docx`, your revised academic presentation.

It also uses the project repository as evidence.

**Result:** 99 pages, portrait, US Letter. 8 chapters, 41 figures, 15 tables, 57 references. All 33 automated checks pass (section 4).

## 1. Items that need your decision

These could not be settled from the documents or the repository.

1. **The brief was cut off.** The pasted instructions end inside section 8.2 (Parents). I did not receive the student requirements (8.3) or any later section. I applied what can be inferred from the received part: 4 student questions and a separate QA report. If the missing sections asked for something else, send them and I will apply them.
2. **Which questionnaire was administered?**
   - Document B's appendix lists 10 questions per group (30 in total), with response counts for all 30.
   - Document A, your later version, cut both the analysis and the appendix to 4 per group. The final report follows A: 12 questions analysed, and the same 12 reproduced in Appendix 1.
   - If respondents actually answered all 30, the appendix should reproduce the full instrument, and the text should say that 4 per group are analysed. Tell me and I will change it.
3. **Survey figures are reproduced as supplied.** The response counts (12 owners and teachers, 20 parents, 15 students) and every percentage come from your documents. I could not check them against the completed questionnaires.
4. **Region.**
   - Section 8.3 (from B) says the project addresses madrasas "particularly in the Northeastern region (Mandera, Wajir and Garissa)".
   - Section 4.4 says participants came from Kajiado and Nairobi counties.
   - Chapter 1 mentions the Coast, North Eastern and Nairobi regions.
   - I kept your wording. Please confirm it is consistent with where the data were collected.
5. **The plagiarism report (Figure A.2)** is your DrillBit report on an earlier draft. Run the check again on this final version and replace the image.
6. **The GitHub repository is private.**
   - Appendix 4 gives the address, but examiners cannot open it unless it is made public or they are given access.
   - The screenshot (Figure A.1) shows an earlier state of the repository.
7. **Page count.** The report is 99 pages, close to Document B (100). Earlier work kept to 75 pages; confirm the department's limit if there is one.
8. **Signatures.** Signature and date lines are blank, to be signed by hand. No signature or approval was added.

## 2. Where each part comes from

| Part | Source | Notes |
|---|---|---|
| Cover, declaration, dedication, acknowledgement | B | Your name, BSCS/2024/52324, Mr. Patrick Muchiri Alianda, School of Business and Technology, Umma University, Kajiado, November 2026, the Umma logo |
| Abstract | A | Latest features and test figures; B's keyword style |
| Table of Contents, Table of Figures, Table of Tables | Word fields | Built by Word, so page numbers are real; chapter entries bold as in B |
| List of Abbreviations | B | Added CLI, HTTPS, SDK, USSD (used in the text) |
| Chapter 1 | A, with B's revisions | 1.2, 1.5, 1.8 and the lead sentence of 1.3 are B's revised wording; 1.1, 1.3.1–1.3.2, 1.4, 1.6, 1.7 are A's updated text |
| Chapter 2 | B | Your lecturer-revised review of NEMIS, QuranPortal, Origin E Madarsa, Alif Cloud and Sudoor HMS, with Figures 2.1–2.5 and Table 2.1. A's older 2.3–2.5 (development and testing inside a literature review) were not used |
| Chapter 3 | B, updated | 3.3.3 and 3.3.5 updated from A and the Git history |
| Chapter 4 | A | Exactly 12 analysed questions (4 + 4 + 4); interview tables; functional and non-functional requirement tables; B's presentation ("Analysis:" and "System solution:" in bold) |
| Chapter 5 | B structure | Class, object and component diagrams; use case, sequence and activity diagrams; ERD; schema; wireframes. Current diagrams, with counts updated to 42 tables and 89 policies |
| Chapter 6 | B structure, A content | B's Table 6.1 updated; B's real VS Code and Supabase screenshots; A's current ILMORA interface screenshots (Figures 6.3–6.9) |
| Chapter 7 | B structure, A results | 185 unit tests, 78 functional cases, 145 database guarantees, 30 of 31 UI checks. B's representative test tables extended with the newer cases |
| Chapter 8 | B structure | B's conclusion (8.3) and recommendations (8.5); A's updated discussion of objectives 3 and 4, future work and summary |
| Appendix | B, with A's questionnaire | Sections A–C from A (4 questions each); Section D (interview guide) and Section E (post-use questionnaire) from B; B's work plan (plus one October row), budget, repository and plagiarism pages |
| References | A | B's sources in a cleaned, alphabetical APA list (B's copy had entries broken across lines) |

## 3. Figures regenerated from current evidence

| Figure | Why | Evidence |
|---|---|---|
| 5.3 Component diagram | B's showed old counts | Repository: 42 tables, 89 policies, 18 Edge Functions, Realtime, USSD |
| 5.8 Database schema | Updated to 42 tables, 89 policies | Live database query, 16 October 2026 |
| 5.9 Share of tables by area | B's showed 40 tables | Same schema groups (8, 7, 6, 6, 5, 4, 3, 2, 1 = 42) |
| 7.1 Unit tests by area | B's showed 74 tests | Vitest run, 16 October 2026: 185 of 185 passed in 23 test files |
| 7.2 Deployment diagram | B's showed 27 migrations, 12 functions and "Expo Go" | Repository and deployment: APK (EAS Build), web console (EAS Hosting), USSD, 41 migrations |
| 6.8 Learning interfaces | Badges panel added | Screenshot from the installed APK |

Wherever A and B held the same diagram, the sharper repository copy was used. B's copies had been reduced in resolution by its PDF conversion.

## 4. Automated checks (all passed)

- **Placeholders and details:** no placeholders remain (`[INSERT…]`, `[STUDENT FULL NAME]` and similar). The student, registration, supervisor, school, university, location and date details are present. The registration number is not confused with an app admission number.
- **Chapter Four questions:**
  - 12 questions analysed, as [4, 4, 4].
  - One chart per question (Figures 4.1–4.12).
  - Each question has an "Analysis:" and a "System solution:".
- **Figures and tables:**
  - All 41 figure numbers and 15 table numbers are unique and in sequence.
  - Every "Figure x.y" or "Table x.y" mentioned in the text exists.
  - Every figure caption has an embedded image.
- **Citations:**
  - Every in-text citation is in the reference list.
  - Every reference is cited.
  - The list is in alphabetical order.
- **Outdated figures:** none remain (40 tables, 84 policies, 27 migrations, 74 unit tests, 56 functional cases, 12 Edge Functions, "Appendix A.1").
- **PDF:** no blank pages, fonts embedded, every page portrait.

## 5. How the reported results were verified

| Figure in the report | How it was verified |
|---|---|
| 185 unit tests passed | Run on 16 October 2026 (`npx vitest run`) |
| 21 database suites, 145 guarantees | Run on 15 October 2026 against the live database (`npm run security:report`), 21 of 21 passed |
| Live functional checks | Run on 15 October 2026, all passed:<br>• screens: 6<br>• learning: 19<br>• notifications: 13<br>• storage: 61<br>• card: 15<br>• USSD: 14<br>• functions: 70<br>• build configuration: 1<br>• tajweed: 5, plus 1 case inconclusive because the AI service was busy |
| 78 functional test cases | Reported as in Document A. This number comes from an earlier numbered run and was not re-counted |
| 30 of 31 UI checks | Reported as in Document A. Push notifications remain unverified; in-app video is switched off and was not tested |
| M-Pesa | Connected to Safaricom's Daraja sandbox. No completed payment from a real phone is on record, so the report does not claim one |

The report keeps these qualifications in place. It does not overstate payments, AI accuracy, notification delivery, offline functionality, physical-device testing or deployment.

## 6. All wording changes made to source text

- 3.3.1: "(Appendix A.1)" → "(Appendix 1)"; "Requirements was identified" → "Requirements were identified".
- 3.3.3: B's sprint paragraph (ending 30 September) → A's paragraph (to 2 October), plus one paragraph on the 4, 12–13 and 15 October sprints from the Git history.
- 3.3.5: "APK build profiles prepared" → APK built and installed, plus the web build on EAS Hosting (from A).
- 4.5.2 and 7.3: "Appendix A.1" → "Appendix 1", to match B's appendix numbering.
- 5.4.2: 40 → 42 tables; 84 → 89 policies; percentages recalculated (Communication 19.0%; Learning 16.7%; Tenancy and identity, and Finance, 14.3% each).
- 5.6: "organises the 40 tables" → "42 tables".
- Table 6.1: updated to the final tool set:
  - 18 Edge Functions and Realtime;
  - Daraja sandbox, Gemini, Paystack (mock), Africa's Talking, the YouTube player and Meet or Zoom links;
  - EAS Build and EAS Hosting;
  - 185 unit tests and 21 SQL suites.
- 6.3: the screenshot sentence now says the images come from the emulator (live backend) and, for some panels of Figures 6.8 and 6.9, the web build at phone size.
- 6.4.1: three paragraphs added from A's later challenges: right-to-left layout, honest AI feedback, and live and offline features.
- 7.2.1 and 7.4: sentences pointing to Figures 7.1 and 7.2 added.
- Tables 7.1–7.3: B's cases kept and renumbered, with A's newer cases added (video link check, offline queue, badges, M-Pesa failure, messaging refusal, installed APK in Arabic, offline banner).
- 8.2: Objectives 3 and 4 use A's updated text (185 / 78 / 145 / 30 of 31, Daraja sandbox).
- 8.3: "four user roles: student, teacher, parent and administrator" → "the madrasa owner, teacher, parent and student, together with a platform administrator"; "implemented under the brand ILMORA" added.
- Appendix 2: one row added for 1–16 October (from the Git history).
- Appendix 3: the M-Pesa budget note now mentions the Daraja sandbox.
- List of Abbreviations: DPA reworded to "Data Protection Act, 2019 (Kenya)"; CLI, HTTPS, SDK and USSD added.

## 7. Rebuilding

The generator is in `source/final/`. It converts A and B into structured content (`extract.py`), assembles the report section by section with every edit recorded (`manuscript.py`), and renders it in B's style (`render.py`). Word then updates the fields and exports the PDF (`final-pdf.ps1`), and `qa_final.py` repeats the checks above.
