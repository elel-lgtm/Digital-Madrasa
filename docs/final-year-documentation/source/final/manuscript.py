"""The final report's content, assembled section by section from Document A
(latest content) and Document B (the student's revised academic version).

Every edit to source text is a visible `fix(...)` with the old and new
wording, so the quality-assurance report can list exactly what changed.
"""
import json, re
from sec import load, section

A, B = load('A'), load('B')
FIG = r'C:/Users/Mohammednur/OneDrive/Desktop/ONLINE MADRASA APP/docs/final-year-documentation/figures'
EDITS = []          # (where, before, after) for the QA report
OUT = []


def emit(*blocks):
    OUT.extend(blocks)


def runs(md):
    """'**bold** plain *italic*' -> [[text, bold, italic]]"""
    out = []
    for part in re.split(r'(\*\*[^*]+\*\*|\*[^*]+\*)', md):
        if not part:
            continue
        if part.startswith('**'):
            out.append([part[2:-2], True, False])
        elif part.startswith('*'):
            out.append([part[1:-1], False, True])
        else:
            out.append([part, False, False])
    return out


def P(md, **kw): return {'t': 'p', 'runs': runs(md), **kw}
def H1(text): return {'t': 'h1', 'text': text}
def H2(text): return {'t': 'h2', 'text': text}
def H3(text): return {'t': 'h3', 'text': text}
def H4(text): return {'t': 'h4', 'text': text}
def BUL(md): return {'t': 'bullet', 'runs': runs(md)}
def NUM(md, list_id): return {'t': 'num', 'runs': runs(md), 'list': list_id}
def FIGURE(path, number, title, width): return {'t': 'fig', 'path': path, 'number': number, 'title': title, 'width': width}
def TABLE(number, title, rows, widths, font=10): return {'t': 'table', 'number': number, 'title': title, 'rows': rows, 'widths': widths, 'font': font}


def ptext(b): return ''.join(r[0] for r in b['runs'])


def fix(where, blocks_or_text, old, new):
    """Replace wording inside a block list (or a string) and record the edit."""
    if isinstance(blocks_or_text, str):
        assert old in blocks_or_text, (where, old)
        EDITS.append((where, old, new))
        return blocks_or_text.replace(old, new)
    hits = 0
    for b in blocks_or_text:
        if b.get('type') == 'para' or b.get('t') in ('p', 'bullet', 'num'):
            for r in b['runs']:
                if old in r[0]:
                    r[0] = r[0].replace(old, new)
                    hits += 1
    assert hits, (where, old)
    EDITS.append((where, old, new))
    return blocks_or_text


def body(blocks, *, captions=None, fig=None, numbered_list=None, skip=()):
    """Convert source blocks: paragraphs, lists, sub-headings, figures and tables.
    `fig` maps a source image file to (path, number, title, width);
    `captions` maps a source table caption number to (number, title)."""
    out = []
    pending_img = None
    i = 0
    while i < len(blocks):
        b = blocks[i]
        i += 1
        t = b['type']
        if t == 'pagebreak':
            continue
        if t == 'heading':
            out.append({'t': {1: 'h1', 2: 'h2', 3: 'h3'}[b['level']], 'text': b['text']})
        elif t == 'para':
            txt = ptext(b).strip()
            if not txt or txt in skip or re.fullmatch(r'CHAPTER [A-Z]+', txt):
                continue
            style = b.get('style', '')
            if style in ('Heading 4', 'Heading 5') and len(txt) < 90:
                out.append(H4(txt))
            elif b.get('list') == 'number' or (numbered_list and b.get('list')):
                out.append({'t': 'num', 'runs': [[r[0], r[1], r[2]] for r in b['runs']], 'list': numbered_list or 'auto'})
            elif b.get('list') == 'bullet':
                out.append({'t': 'bullet', 'runs': [[r[0], r[1], r[2]] for r in b['runs']]})
            else:
                out.append({'t': 'p', 'runs': [[r[0], r[1], r[2]] for r in b['runs']]})
        elif t == 'image':
            if fig is None or b['file'] not in fig:
                raise KeyError(f'unmapped image {b["file"]}')
            path, number, title, width = fig[b['file']]
            out.append(FIGURE(path, number, title, width))
            if i < len(blocks) and blocks[i]['type'] == 'caption':
                i += 1
        elif t == 'caption':
            continue  # figure captions are taken from `fig`; table captions from `captions`
        elif t == 'table' and any('[INSERT' in c for r in b['rows'] for c in r):
            # Placeholder boxes from Document A; the real evidence comes from Document B.
            if i < len(blocks) and blocks[i]['type'] == 'caption':
                i += 1
            continue
        elif t == 'table':
            cap = None
            if i < len(blocks) and blocks[i]['type'] == 'caption' and blocks[i]['kind'] == 'Table':
                cap = blocks[i]; i += 1
            if cap is None:
                raise ValueError('table without caption: ' + str(b['rows'][0]))
            number, title = captions[cap['number']]
            out.append(TABLE(number, title, b['rows'], None))
    return out


# ============================================================ FRONT MATTER
emit({'t': 'cover'})
emit({'t': 'section', 'numbering': 'roman'})
emit(H1('DECLARATION'))
emit(P('I **Mohammednur Sukyan**, hereby declare that this document is entirely my own work and has not been submitted to any university or institution for the award of a degree. To the best of my knowledge, it does not include any material previously published or written by another person, except where due reference has been made in the text.'))
emit({'t': 'sign', 'role': 'student'})
emit(P('This system project has been submitted for examination with my approval as university supervisor.'))
emit({'t': 'sign', 'role': 'supervisor'})

emit(H1('DEDICATION'))
emit(P('I dedicate this work to my beloved parents and family for their love, prayers and support throughout my studies, and to my friends, mentors and siblings for their encouragement. I also dedicate it to the Muslim community of Kenya, especially the students, teachers and parents of our duksi and madrasas. May this work contribute in a small way to the teaching and memorisation of the Holy Quran.'))

emit(H1('ACKNOWLEDGEMENT'))
emit(P('All praise is due to Allah (SWT) for granting me health, strength, and perseverance to complete this project. I sincerely thank my supervisor, Mr. Patrick Muchiri Alianda, for his guidance and feedback throughout the project. I thank my parents and family for their prayers, encouragement, and support, as well as my relatives, friends, and classmates for their motivation. I am grateful to Umma University and the School of Business and Technology for providing the learning environment that made this work possible. May Allah (SWT) reward all those who supported me. Ameen.'))

emit(H1('ABSTRACT'))
abstract = [b for b in A[A.index(next(x for x in A if x.get('text') == 'ABSTRACT')) + 1:] if b['type'] == 'para'][:4]
for b in abstract[:3]:
    emit({'t': 'p', 'runs': b['runs']})
emit(P('**Keywords:** Digital Madrasa, ILMORA, Madrasa Management, Quran Memorisation, Mobile Application, Multi-Tenancy, React Native, Supabase, M-Pesa, Kenya.'))

emit({'t': 'toc'})
emit({'t': 'lof'})
emit({'t': 'lot'})

emit(H1('LIST OF ABBREVIATIONS'))
abbr_b = [r for blk in B if blk['type'] == 'table' and blk['rows'][0][0] in ('Abbreviation', 'HMS') for r in blk['rows'] if r[0] != 'Abbreviation']
abbr = dict((r[0], r[1]) for r in abbr_b)
abbr.update({
    'CLI': 'Command-Line Interface',
    'HTTPS': 'Hypertext Transfer Protocol Secure',
    'SDK': 'Software Development Kit',
    'USSD': 'Unstructured Supplementary Service Data',
    'DPA': 'Data Protection Act, 2019 (Kenya)',
})
emit({'t': 'abbr', 'rows': sorted(abbr.items(), key=lambda kv: kv[0].lower())})

# ============================================================ CHAPTER ONE
emit({'t': 'section', 'numbering': 'arabic'})
emit(H1('CHAPTER ONE: INTRODUCTION'))
emit(H2('1.1 Background of the Study'))
emit(*body(section(A, '1.1 ')))
emit(H2('1.2 Problem Statement'))
emit(*body(section(B, '1.2 ')))            # B: the student's revised wording, with its concluding paragraph
emit(H2('1.3 Objectives'))
emit(*body(section(B, '1.3 ')[:1]))        # B's lead sentence under 1.3
emit(H3('1.3.1 General Objective'))
emit(*body(section(A, '1.3.1')))
emit(H3('1.3.2 Specific Objectives'))
emit(*body(section(A, '1.3.2'), numbered_list='obj'))
emit(H2('1.4 Research Questions'))
emit(*body(section(A, '1.4 '), numbered_list='rq'))
emit(H2('1.5 Justification'))
emit(*body(section(B, '1.5 ')))
emit(H2('1.6 Scope of the Project'))
emit(*body(section(A, '1.6 ')))
emit(H2('1.7 Limitations'))
emit(*body(section(A, '1.7 ')))
emit(H2('1.8 Summary'))
emit(*body(section(B, '1.8 ')))

# ============================================================ CHAPTER TWO (B: lecturer-revised review)
emit(H1('CHAPTER TWO: LITERATURE REVIEW'))
fig2 = {
    'img_B/B002.png': ('img_B/B002.png', '2.1', 'NEMIS portal sign-in page (Source: Ministry of Education, n.d.)', 4.9),
    'img_B/B003.png': ('img_B/B003.png', '2.2', 'QuranPortal teacher workspace (Source: QuranPortal, n.d.)', 5.6),
    'img_B/B004.png': ('img_B/B004.png', '2.3', 'Origin E Madarsa administrator interface (Source: Origin Softwares, n.d.)', 6.2),
    'img_B/B005.png': ('img_B/B005.png', '2.4', 'Alif Cloud administrator dashboard (Source: Alif Cloud, n.d.-a)', 5.6),
    'img_B/B006.png': ('img_B/B006.png', '2.5', 'Sudoor HMS screens in its official product image (Source: Sudoor HMS, 2026)', 5.6),
}
ch2 = section(B, 'CHAPTER TWO')
ch2b = body(ch2, fig=fig2, captions={'2.1': ('2.1', 'Comparison of existing systems related to madrasa management')})
for b in ch2b:
    if b['t'] == 'table':
        b['widths'] = [1.55, 0.75, 1.0, 1.15, 1.1, 1.1]
        b['font'] = 9.5
emit(*ch2b)

# ============================================================ CHAPTER THREE (B structure, A's later facts)
emit(H1('CHAPTER THREE: SYSTEM DEVELOPMENT METHODOLOGY'))
ch3 = body(section(B, 'CHAPTER THREE'), fig={'img_B/B007.png': (f'{FIG}/diagrams/fig3-1-agile.png', '3.1', 'Agile development methodology used in the project', 4.6)})
# 3.3.3: B stops at 30 September; A adds the 30 Sep - 2 Oct sprint; the git history adds October.
i333 = next(k for k, b in enumerate(ch3) if b.get('text') == '3.3.3 Development Phase')
a333 = [b for b in body(section(A, '3.3.3')) if b['t'] == 'p']
ch3[i333 + 1] = a333[0]
ch3.insert(i333 + 2, P('Further sprints recorded in the Git history extended the system. On 4 October they added the Hijri date, printable certificates with a verification QR code and ijazah certificates carrying the teacher’s sanad, the Sabaq–Sabqi–Manzil daily hifz plan, a tajweed mistake map and weekly insights for teachers, spoken progress reports for parents, a USSD menu for basic phones, anonymous fee sponsorship and recite-along practice. Between 12 and 13 October the application received its ILMORA brand identity, comparison with a master reciter, M-Pesa prompts and receipts on Safaricom’s Daraja sandbox, a library of teacher-chosen Quran videos, a live reading room, scheduled live sessions and two-way parent–teacher messaging. On 15 October the last sprint added an impact dashboard, a one-command security report, attendance that can be marked offline, and hifz streaks and badges.'))
EDITS.append(('3.3.3 Development Phase', 'B text ending 30 September', "A's sprint paragraph plus a paragraph on the October sprints from the Git history"))
i335 = next(k for k, b in enumerate(ch3) if b.get('text') == '3.3.5 Deployment Phase')
a335 = [b for b in body(section(A, '3.3.5')) if b['t'] == 'p']
ch3[i335 + 1] = P(ptext(a335[0]) + ' The web build was later published on Expo’s hosting service so that the platform administrator’s console can be used from a browser.')
EDITS.append(('3.3.5 Deployment Phase', 'B: APK build profiles prepared', "A: APK built and installed; plus web hosting"))
ch3 = fix('3.3.1', ch3, '(Appendix A.1)', '(Appendix 1)')
ch3 = fix('3.3.1', ch3, 'Requirements was identified', 'Requirements were identified')
emit(*[b for b in ch3 if not (b['t'] == 'h1')])

# ============================================================ CHAPTER FOUR (A: 12-question analysis)
emit(H1('CHAPTER FOUR: REQUIREMENTS GATHERING AND ANALYSIS'))
bcap = {c['title'].lower(): c['title'] for c in B if c['type'] == 'caption' and c['number'].startswith('4.')}
ch4src = section(A, '4. REQUIREMENTS')
ch4fig = {}
k = 0
for idx, b in enumerate(ch4src):
    if b['type'] == 'image':
        cap = ch4src[idx + 1]
        title = bcap.get(cap['title'].lower(), cap['title'][0] + cap['title'][1:].lower())
        ch4fig[b['file']] = (b['file'], cap['number'], title, 5.6)
ch4 = body(ch4src, fig=ch4fig, captions={
    '4.1': ('4.1', 'Primary data collection participants'),
    '4.2': ('4.2', 'Madrasa owner and teacher interview summary'),
    '4.3': ('4.3', 'Parent interview summary'),
    '4.4': ('4.4', 'Student interview summary'),
    '4.5': ('4.5', 'Functional requirements'),
    '4.6': ('4.6', 'Non-functional requirements'),
})
# B's presentation: "Analysis:" and "System solution:" as bold lead-ins, questions in bold,
# group headings as sub-headings.
merged = []
lead = None
for b in ch4:
    txt = ptext(b).strip() if b['t'] in ('p', 'bullet', 'num') else None
    if b['t'] == 'p' and txt in ('Analysis', 'System Solution', 'System solution'):
        lead = 'Analysis: ' if txt == 'Analysis' else 'System solution: '
        continue
    if b['t'] == 'p' and txt in ('Madrasa Owner and Teacher Questionnaire Analysis', 'Parent Questionnaire Analysis', 'Student Questionnaire Analysis',
                                 'Functional Requirements', 'Non-Functional Requirements', 'Stakeholders Identification',
                                 'Madrasa Owner and Teacher Interview Summary', 'Parent Interview Summary', 'Student Interview Summary'):
        merged.append(H4(txt))
        continue
    if b['t'] == 'p' and re.match(r'^Question \d+:', txt):
        merged.append({'t': 'p', 'runs': [[txt, True, False]], 'keep_next': True})
        continue
    if lead and b['t'] == 'p':
        b = {'t': 'p', 'runs': [[lead, True, False]] + b['runs']}
        lead = None
    merged.append(b)
ch4 = fix('4.5.2', merged, 'Appendix A.1', 'Appendix 1')
emit(*[b for b in ch4 if b['t'] != 'h1'])
q = sum(1 for b in ch4 if b['t'] == 'p' and re.match(r'^Question \d+:', ptext(b)))
assert q == 12, f'Chapter Four analyses {q} questions, not 12'

# ============================================================ CHAPTER FIVE (B structure, current figures)
emit(H1('CHAPTER FIVE: SYSTEM DESIGN'))
fig5 = {
    'img_B/B038.png': (f'{FIG}/diagrams/fig5-class.png', '5.1', 'Class diagram', 5.6),
    'img_B/B039.png': ('img_B/B039.png', '5.2', "Object diagram of one student's records", 6.1),
    'img_B/B040.png': (f'{FIG}/final/fig5-3-component.png', '5.3', 'Component diagram', 6.4),
    'img_B/B041.png': (f'{FIG}/diagrams/fig5-usecase.png', '5.4', 'Use case diagram', 5.6),
    'img_B/B042.png': (f'{FIG}/diagrams/fig5-sequence.png', '5.5', 'Sequence diagram for recitation submission and review', 6.3),
    'img_B/B043.png': (f'{FIG}/diagrams/fig5-activity-qr.png', '5.6', 'Activity diagram for QR attendance', 4.6),
    'img_B/B044.png': (f'{FIG}/erd/erd-core.png', '5.7', 'Entity relationship diagram', 6.0),
    'img_B/B045.png': (f'{FIG}/diagrams/fig5-schema.png', '5.8', 'Database schema', 6.2),
    'img_B/B046.png': (f'{FIG}/final/fig5-9-tables.png', '5.9', 'Share of database tables by functional area', 6.0),
    'img_B/B047.png': (f'{FIG}/diagrams/fig5-wireframes.png', '5.10', 'Wireframes of the main screens', 6.3),
}
ch5 = body(section(B, 'CHAPTER FIVE'), fig=fig5)
ch5 = fix('5.4.2', ch5, 'PostgreSQL database of 40 tables', 'PostgreSQL database of 42 tables')
ch5 = fix('5.4.2', ch5, 'enabled and forced on all 40 tables, governed by 84 policies', 'enabled and forced on all 42 tables, governed by 89 policies')
ch5 = fix('5.4.2', ch5, 'how the 40 tables are distributed', 'how the 42 tables are distributed')
ch5 = fix('5.4.2', ch5, 'Communication is the largest area (8 tables, 20.0%)', 'Communication is the largest area (8 tables, 19.0%)')
ch5 = fix('5.4.2', ch5, 'Tenancy and identity, learning and finance each account for 6 tables (15.0%)', 'Learning has 7 tables (16.7%), including the class video library, and tenancy and identity and finance each account for 6 tables (14.3%)')
ch5 = fix('5.6', ch5, 'organises the 40 tables', 'organises the 42 tables')
emit(*ch5)

# ============================================================ CHAPTER SIX (B structure, A's interfaces)
emit(H1('CHAPTER SIX: SYSTEM DEVELOPMENT AND IMPLEMENTATION'))
emit(H2('6.1 Introduction'))
emit(*body(section(A, '6.1 ')))
emit(H2('6.2 System Development Tools and Techniques'))
emit(*body(section(B, '6.2 ')[:1]))
emit(TABLE('6.1', 'Development tools and technologies', [
    ['Area', 'Tools and technologies'],
    ['Language', 'TypeScript (strict mode) for the app and Edge Functions; SQL (PostgreSQL) for the schema, policies and database functions'],
    ['Client framework', 'React Native with Expo SDK 54, Expo Router (file-based navigation, separate route groups per role), React Native Web'],
    ['State and validation', 'TanStack Query for server state, caching and the offline outbox; Zod for form and payload validation'],
    ['Languages', 'i18next with English, Kiswahili, Somali and Arabic (right-to-left) translations'],
    ['Device features', 'expo-camera (QR scanning), expo-av (recitation recording and playback), expo-notifications (push), expo-secure-store (session storage), speech recognition for recite-along'],
    ['Backend', 'Supabase: PostgreSQL with Row Level Security, Auth, Storage (private audio bucket), Realtime (reading room), 18 Edge Functions (Deno), scheduled jobs'],
    ['External services', 'Safaricom Daraja M-Pesa STK push (sandbox); Google Gemini (recitation feedback, assistant, spoken reports); Paystack (cards, mock); Africa’s Talking (USSD); YouTube embedded player; Google Meet or Zoom links; e-mail, SMS and Expo push providers'],
    ['Quality', 'Vitest (185 unit tests), 21 SQL verification suites, scripted functional checks against the live backend, TypeScript compiler'],
    ['Build and hosting', 'Expo Application Services: EAS Build (Android APK) and EAS Hosting (web build); Supabase CLI (migrations, functions, secrets)'],
    ['Version control', 'Git with a GitHub repository; automated checks on every push; database backup every three days'],
], [1.6, 4.9]))
EDITS.append(('Table 6.1', "B's table (12 Edge Functions, mock providers, Expo Go)", 'updated to the final tool set'))
emit(H3('6.2.1 Integrated Development Environment (IDE)'))
emit(*body(section(B, '6.2.1'), fig={'img_B/B048.png': ('img_B/B048.png', '6.1', 'The Digital Madrasa project in Visual Studio Code', 6.3)}))
emit(H3('6.2.2 Front-end Development'))
emit(*body(section(A, '6.2.2')))
emit(H3('6.2.3 Backend and Database Management Tools'))
a623 = [b for b in body(section(A, '6.2.3')) if b['t'] == 'p']
emit(a623[0])
emit(FIGURE('img_B/B049.png', '6.2', 'Supabase project dashboard', 6.3))
emit(H2('6.3 System Interfaces'))
ch63 = section(A, '6.3 ')
fig6 = {}
caps6 = {'6.3': 'Parent sign-up screen', '6.4': 'Owner dashboard', '6.5': 'Teacher dashboard', '6.6': 'Parent dashboard',
         '6.7': 'Student dashboard', '6.8': 'Recitation, live learning and badge interfaces', '6.9': 'Payment, messaging and offline interfaces'}
for idx, b in enumerate(ch63):
    if b['type'] == 'image':
        num = ch63[idx + 1]['number']
        fig6[b['file']] = (b['file'], num, caps6[num], 2.6 if num < '6.8' else 6.3)
ch63b = body(ch63, fig=fig6)
for k, b in enumerate(ch63b):   # "Owner Interface" etc. were bold paragraphs in A; B shows them as sub-headings
    if b['t'] == 'p' and all(r[1] for r in b['runs']) and len(ptext(b)) < 60:
        ch63b[k] = H4(ptext(b))
ch63b = fix('6.3', ch63b, 'The following screenshots, captured on an Android phone screen, show', 'The following screenshots, captured from the running application on an Android emulator connected to the live backend and, for some panels of Figures 6.8 and 6.9, from the web build at phone size, show')
emit(*ch63b)
emit(H2('6.4 Challenges Encountered During Development'))
emit(P('Several technical, practical and economic challenges arose during development. This section describes them and how each was addressed.'))
emit(H3('6.4.1 Technical Complexities'))
emit(*[b for b in body(section(B, '6.4.1'))])
emit(P('**Right-to-left layout.** Testing the installed build revealed that Arabic headings were drawn on the wrong side, because React Native swaps left and right in a right-to-left layout; this was then fixed.'))
emit(P('**Keeping AI feedback honest.** Given silence and the expected text, one AI model reported a perfect recitation, so the audio is now first transcribed without the text and checked in code before any score is given, and no recording is assessed without a parent’s consent.'))
emit(P('**Live features and offline use.** A reading-room channel had to admit only the pupils, parents and teachers of that class, so access is decided by a database rule. Attendance saved without a connection was at first held back until the network returned, so the register is now kept on the phone and sent automatically on reconnection. On the web, where there is no secure key store, the session is kept in the browser tab.'))
EDITS.append(('6.4.1', "B's four lead-in paragraphs", "plus three from A's later challenges (RTL, AI honesty, live and offline)"))
emit(H3('6.4.2 User Adoption and Resistance'))
emit(*body(section(A, '6.4.2')))
emit(H3('6.4.3 Economic Constraints'))
emit(*body(section(A, '6.4.3')))
emit(H3('6.4.4 Continuous Updates and Support'))
emit(*body(section(A, '6.4.4')))
emit(H2('6.5 Summary'))
emit(P('This chapter described the implementation of the Digital Madrasa Mobile Application, branded ILMORA, with Visual Studio Code, React Native with Expo, and Supabase. It presented the sign-up screen, the dashboards for owners, teachers, parents and students, and the learning, payment, messaging and offline interfaces, and discussed the main development challenges: multi-tenant security, performance of access rules, payment integrity, right-to-left layout, honest AI feedback, live and offline features, user adoption, limited resources and continuous maintenance. The next chapter describes how the system was tested and deployed.'))

# ============================================================ CHAPTER SEVEN
emit(H1('CHAPTER SEVEN: TESTING AND DEPLOYMENT'))
emit(H2('7.1 Introduction'))
emit(*body(section(B, '7.1 ')))
emit(H2('7.2 System Testing and Validation'))
emit(*body(section(B, '7.2 ')[:1]))
emit(H3('7.2.1 Unit Tests'))
a721 = [b for b in body(section(A, '7.2.1'), captions={'7.1': ('7.1', 'Unit testing')}) if b['t'] == 'p']
emit(fix('7.2.1', [a721[0]], 'Table 7.1 shows representative cases.', 'Figure 7.1 shows their distribution by area, and Table 7.1 lists representative cases.')[0])
emit(FIGURE(f'{FIG}/final/fig7-1-unit-tests.png', '7.1', 'Distribution of the 185 unit tests by area', 6.2))
ut = [r for blk in section(B, '7.2.1') if blk['type'] == 'table' for r in blk['rows'] if r[0] != 'ID']
ut += [['', 'Video library', 'A link that is not from YouTube', 'Link refused', 'As expected', 'Pass'],
       ['', 'Offline queue', 'Register saved with no connection', 'Kept on the phone; sent once on reconnect', 'As expected', 'Pass'],
       ['', 'Streaks and badges', 'A surah still being learned', 'Not counted towards a badge', 'As expected', 'Pass']]
ut = [[f'UT{k + 1:02d}'] + r[1:] for k, r in enumerate(ut)]
emit(TABLE('7.1', 'Unit testing', [['ID', 'Module', 'Test case description', 'Expected result', 'Actual result', 'Status']] + ut, [0.55, 1.15, 1.9, 1.75, 0.9, 0.6], font=9.5))
emit(H3('7.2.2 Functional Testing'))
a722 = body(section(A, '7.2.2'), captions={'7.2': ('7.2', 'Functional testing')})
for b in a722:
    if b['t'] in ('p', 'bullet'):
        emit(b)
ft = [r for blk in section(B, '7.2.2') if blk['type'] == 'table' for r in blk['rows'] if r[0] != 'ID']
ft = [r for r in ft if r[0].startswith('FT')]
ft += [['', 'M-Pesa failure', 'Customer cancels or lacks funds', 'Payment failed with the reason; invoice still due', 'As expected', 'Pass'],
       ['', 'Messaging', 'Parent writes to a teacher of another child', 'Message refused', 'As expected', 'Pass']]
ft = [[f'FT{k + 1:02d}'] + r[1:] for k, r in enumerate(ft)]
emit(TABLE('7.2', 'Functional and security testing', [['ID', 'Feature', 'Test scenario', 'Expected outcome', 'Actual outcome', 'Status']] + ft, [0.55, 1.15, 1.9, 1.75, 0.9, 0.6], font=9.5))
emit(H3('7.2.3 User Interface (UI) Testing'))
for b in body(section(A, '7.2.3'), captions={'7.3': ('7.3', 'User interface testing')}):
    if b['t'] in ('p', 'bullet'):
        emit(b)
ui = [r for blk in section(B, '7.2.3') if blk['type'] == 'table' for r in blk['rows'] if r[0] != 'ID']
ui = [r for r in ui if r[0].startswith('UI')]
ui += [['', 'Installed APK', 'App opened in Arabic on the APK', 'Headings and layout mirrored correctly', 'As expected after fix', 'Pass'],
       ['', 'Offline banner', 'Connection cut while marking attendance', 'Banner shown; register kept and later sent', 'As expected', 'Pass']]
ui = [[f'UI{k + 1:02d}'] + r[1:] for k, r in enumerate(ui)]
emit(TABLE('7.3', 'User interface testing', [['ID', 'UI element', 'Test scenario', 'Expected result', 'Actual result', 'Status']] + ui, [0.55, 1.15, 1.9, 1.75, 0.9, 0.6], font=9.5))
emit(H2('7.3 Testing Results'))
a73 = body(section(A, '7.3 '), captions={'7.4': ('7.4', 'Testing results')})
for b in a73:
    if b['t'] == 'table':
        b['widths'] = [2.3, 1.3, 0.8, 0.8, 1.5]
    emit(b)
emit(*fix('7.3', [b for b in body(section(B, '7.3 '), captions={'7.4': ('7.4', 'x')}) if b['t'] == 'p'][-1:], 'Appendix A.1 (Section E)', 'Appendix 1 (Section E)'))
emit(H2('7.4 System Deployment'))
a74 = [b for b in body(section(A, '7.4 ')) if b['t'] == 'p']
emit(fix('7.4', [a74[0]], 'backed up every three days.', 'backed up every three days. Figure 7.2 shows the deployment.')[0])
emit(FIGURE(f'{FIG}/final/fig7-2-deployment.png', '7.2', 'Deployment diagram', 6.4))
emit(H3('7.4.1 Current Deployment Methods'))
emit(P('**Backend.** The database schema, security policies and server functions were deployed to the hosted Supabase project with the Supabase CLI, and secrets were set on the server so that they never appear in the app or the repository.'))
emit(P('**Mobile application.** The application is built as an installable Android package (APK) with Expo Application Services (EAS) and connects to the live backend. The APK is distributed directly:'))
emit(BUL('**Direct APK sharing:** the APK file is shared through Google Drive, Bluetooth or USB, and users install it by allowing installation from unknown sources.'))
emit(BUL('**WhatsApp distribution:** the APK is shared as a document on WhatsApp, which madrasa owners, teachers and parents already use.'))
emit(P('**Web.** The same codebase is published as a website on Expo’s free hosting (EAS Hosting) at https://https-ilmora-expo-app.expo.app, where the platform administrator’s console runs and owners, teachers and parents can also sign in.'))
emit(H3('7.4.2 Future Deployment Plans'))
for b in body(section(A, '7.4.2')):
    emit(b)
emit(H2('7.5 Summary'))
emit(*body(section(A, '7.5 ')))

# ============================================================ CHAPTER EIGHT (B structure)
emit(H1('CHAPTER EIGHT: DISCUSSIONS, CONCLUSIONS, FUTURE WORKS AND RECOMMENDATIONS'))
emit(H2('8.1 Introduction'))
emit(*body(section(B, '8.1 ')))
emit(H2('8.2 Discussion of Objectives'))
a82 = [ptext(b) for b in section(A, '8.2 ') if b['type'] == 'para' and not ptext(b).startswith('Objective ')]
b82 = [b for b in body(section(B, '8.2 '))]
emit(b82[0])  # Objective 1 (B: with the questionnaire figures)
emit(b82[1])  # Objective 2 (B)
emit(P('**Objective 3: to design and develop the application.** This objective was achieved. ' + a82[2]))
emit(P('**Objective 4: to test the system.** ' + a82[3]))
EDITS.append(('8.2 Objectives 3 and 4', "B's text (74 unit tests, 56 functional cases)", "A's updated text (185 unit tests, 78 functional cases, 145 guarantees, 30 of 31 UI checks, M-Pesa sandbox)"))
emit(H2('8.3 Conclusion'))
c83 = body(section(B, '8.3 '))
c83 = fix('8.3', c83, 'The application supports four user roles: student, teacher, parent and administrator.', 'The application supports four user roles, the madrasa owner, teacher, parent and student, together with a platform administrator.')
c83 = fix('8.3', c83, 'This project set out', 'This project, implemented under the brand ILMORA, set out')
emit(*c83)
emit(H2('8.4 Future Work'))
for k, (h, src) in enumerate([('8.4.1 Deployment to Google Play Store', '8.3.1'), ('8.4.2 Development of Web-Based Admin Dashboard', '8.3.2'),
                              ('8.4.3 Integration of Push Notifications and Messaging', '8.3.3'), ('8.4.4 Smart Alerts and Recommendations', '8.3.4'),
                              ('8.4.5 Enhanced Offline Functionality', '8.3.5')]):
    emit(H3(h))
    emit(*body(section(A, src)))
emit(H2('8.5 Recommendations'))
emit(*body(section(B, '8.5 ')))
emit(H2('8.6 Summary'))
emit(*body(section(A, '8.5 ')))

# ============================================================ APPENDICES
emit(H1('APPENDIX: SUPPORTING MATERIALS'))
emit(H2('APPENDIX 1: User Survey Questionnaire'))
emit(*body(section(B, 'APPENDIX 1')[:1]))
for sec_name in ('Section A', 'Section B', 'Section C'):
    blocks = section(A, sec_name)
    title = next(b['text'] for b in A if b['type'] == 'heading' and b['text'].startswith(sec_name))
    emit(H3(title))
    for b in blocks:
        txt = ptext(b).strip() if b['type'] == 'para' else ''
        if not txt:
            continue
        if txt.startswith('Question'):
            emit({'t': 'p', 'runs': [[txt, True, False]], 'keep_next': True, 'after': 2})
        else:
            emit({'t': 'p', 'runs': [[txt, False, False]], 'indent': 0.4, 'after': 0, 'line': 1.15})
emit(H3('Section D: Interview Guide for Madrasa Owners and Senior Teachers'))
for b in body(section(B, 'Section D'), numbered_list='guide'):
    emit(b)
emit(H3('Section E: Post-Use Evaluation Questionnaire'))
for b in body(section(B, 'Section E'), captions={'A.1': ('A.1', 'Post-use evaluation questionnaire')}):
    if b['t'] == 'table':
        b['widths'] = [3.9, 0.5, 0.5, 0.5, 0.5, 0.5]
    emit(b)
emit(H2('APPENDIX 2: Work Plan and Schedule'))
wp = next(blk for blk in section(B, 'APPENDIX 2') if blk['type'] == 'table')['rows']
wp = [r for k, r in enumerate(wp) if k == 0 or r[0] != 'Task']
wp.insert(-1, ['Feature extensions and ILMORA brand', '01/10/26', '16/10/26', '16 days', 'AI feedback, certificates, hifz plan, USSD, M-Pesa sandbox, live reading room and sessions, videos, messaging, offline attendance, impact, badges, web console (from the Git history)'])
emit(TABLE('A.2', 'Work plan and schedule', wp, [1.6, 0.8, 0.8, 0.75, 2.6], font=9.5))
EDITS.append(('Appendix 2', "B's work plan", 'one row added for the October sprints recorded in the Git history'))
emit(H2('APPENDIX 3: Budget'))
bud = next(blk for blk in section(B, 'APPENDIX 3') if blk['type'] == 'table')['rows']
for r in bud:
    if r[0].startswith('M-Pesa, e-mail and SMS'):
        r[4] = 'Daraja sandbox and mock providers during development; pay per use when live'
emit(TABLE('A.3', 'Budget', bud, [2.0, 0.85, 0.85, 0.9, 1.9], font=9.5))
emit(H2('APPENDIX 4: My Project Repository'))
emit(P('The complete source code for both applications, together with the database migration files and the supporting documentation, is held in the project repository.'))
emit(P('Repository address: https://github.com/elel-lgtm/Digital-Madrasa/'))
emit(FIGURE('img_B/B057.png', 'A.1', 'Project repository on GitHub', 6.3))
emit(H2('APPENDIX 5: Plagiarism Report'))
emit(FIGURE('img_B/B058.png', 'A.2', 'Plagiarism report', 4.7))

# ============================================================ REFERENCES (A: cleaned list)
emit(H1('REFERENCES'))
refs = [ptext(b) for b in section(A, 'REFERENCES') if b['type'] == 'para']
emit({'t': 'refs', 'items': refs})

json.dump(OUT, open('final.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(EDITS, open('edits.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(OUT), 'blocks;', len(EDITS), 'recorded edits')
