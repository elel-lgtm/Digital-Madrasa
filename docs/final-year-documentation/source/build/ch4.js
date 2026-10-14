const K = require('./kit');
const { p, chapter, h2, h3, bullet, table, evidenceBox } = K;

const INSERT = '[INSERT ACTUAL SURVEY RESULTS HERE]';
const FINDING = '[INSERT ACTUAL FINDINGS HERE]';

// One questionnaire question laid out as in the reference: the question, its
// pie chart, the analysis of the responses and the system's answer to it.
function question(n, text, fig, title, solution) {
  return [
    p(`Question ${n}: ${text}`, { bold: true }),
    ...evidenceBox(fig, title, ['[INSERT PIE CHART HERE]', `Pie chart of responses to: “${text}”`],
      'Chart to be inserted from the questionnaire results.', 2.2),
    p('Analysis', { bold: true, spacing: { after: 60 } }),
    p(INSERT),
    p('System Solution', { bold: true, spacing: { after: 60 } }),
    p(solution),
  ];
}

function interview(number, who, rows) {
  return [
    p(`${who} Interview Summary`, { bold: true }),
    ...table(number, `${who} Interview Summary`, ['Theme', `Key Insights from ${who}s`],
      rows.map((theme) => [theme, FINDING]), [2800, 6560]),
  ];
}

module.exports = function ch4() {
  return [
    ...chapter('FOUR', 'Requirements Gathering and Analysis'),

    h2('4.1 Introduction'),
    p('This chapter outlines the process of requirements gathering and analysis for Digital '
      + 'Madrasa. The objective of this phase was to identify the needs of the system’s users, '
      + 'namely madrasa owners and teachers, parents and students, in order to develop a practical '
      + 'and user-centred mobile solution. Requirements were gathered through questionnaires, '
      + 'interviews, observation and a review of the literature and existing systems. The '
      + 'process focused on how madrasas currently record attendance, memorisation and fees, how '
      + 'parents follow their children’s progress, and how recitation is assessed. The insights '
      + 'obtained informed the system’s architecture, database structure and role-based '
      + 'functions.'),

    h2('4.2 Data Collection Approach'),
    p('A mixed approach was adopted. Structured questionnaires give comparable answers that can '
      + 'be counted and presented as charts, while interviews and observation explain how and why '
      + 'practices differ between madrasas. Combining the two ensures that the requirements are '
      + 'based both on how common a problem is and on the real experience of the people who face '
      + 'it.'),

    h2('4.3 Data Collection Methods'),
    p('Both primary and secondary data collection methods were used. Primary data were collected '
      + 'directly from madrasa owners, teachers, parents and students using the questionnaire and '
      + 'interview guide in Appendix A.1, and by observing how attendance is taken and recitation is '
      + 'assessed in madrasa sessions. Secondary data were collected from published studies, '
      + 'government reports and a review of existing systems, as presented in Chapter Two.'),
    p('The main techniques used were:'),
    bullet('Questionnaires for madrasa owners and teachers, parents and students'),
    bullet('Interviews with madrasa owners and senior teachers'),
    bullet('Observation of attendance taking and recitation assessment'),
    bullet('Review of relevant studies, reports and similar systems'),

    h2('4.4 Primary Data Collection'),
    p('Primary data collection focused on obtaining direct insights from the people who run and '
      + 'use madrasas. A total of [INSERT] participants were involved in the study, comprising:'),
    ...table('4.1', 'Primary Data Collection', ['Stakeholder', 'Number of Respondents'], [
      ['Madrasa owners and teachers', '[INSERT]'],
      ['Parents', '[INSERT]'],
      ['Students', '[INSERT]'],
      ['Total', '[INSERT]'],
    ], [5600, 3760]),

    h2('4.5 Data Analysis'),
    p('Questionnaire responses were summarised as counts and presented as pie charts, while '
      + 'interview and observation notes were analysed for recurring themes, challenges and '
      + 'expectations. Each finding was then mapped to a feature of the system.'),
    h3('4.5.1 Interview Data Summary'),
    p('The following tables summarise the interview responses from each stakeholder group.'),
    ...interview('4.2', 'Madrasa Owner and Teacher', ['Record keeping', 'Attendance', 'Memorisation tracking',
      'Fee collection', 'Communication with parents', 'Expectations']),
    ...interview('4.3', 'Parent', ['Knowledge of attendance', 'Knowledge of progress', 'Fee payment',
      'Communication with the madrasa', 'Expectations']),
    ...interview('4.4', 'Student', ['Recitation practice', 'Feedback from the teacher', 'Use of phones',
      'Expectations']),

    h3('4.5.2 Questionnaire Analysis'),
    p('Madrasa Owner and Teacher Questionnaire Analysis', { bold: true }),
    p('A total of [INSERT] madrasa owners and teachers participated in the survey. The objective '
      + 'was to understand how attendance, memorisation progress and fees are currently managed.'),
    ...question(1, 'How is student attendance currently recorded in your madrasa?', '4.1',
      'Recording Student Attendance',
      'The system provides a digital attendance register for each class and QR-code attendance, '
      + 'in which a student scans a code on the teacher’s phone that changes every 30 seconds, so '
      + 'attendance is recorded once, cannot be forged and is summarised on the dashboard.'),
    ...question(2, 'How is a student’s Quran memorisation progress recorded?', '4.2',
      'Memorisation Progress Tracking',
      'Teachers record memorisation surah by surah in the app. The system calculates the juz '
      + 'completed and the passages due for revision, and shows them to the student and the '
      + 'approved parent.'),
    ...question(3, 'How are fees recorded and communicated to parents?', '4.3', 'Fee Collection Methods',
      'The owner defines fee structures and issues numbered invoices to the whole madrasa, a class '
      + 'or one student. Parents see each invoice and pay it by M-Pesa, and the system issues a '
      + 'receipt and updates the balance automatically.'),

    p('Parent Questionnaire Analysis', { bold: true }),
    p('A total of [INSERT] parents participated in the survey. The questionnaire focused on how '
      + 'parents follow their children’s madrasa education and pay fees.'),
    ...question(1, 'How do you currently learn about your child’s attendance and progress?', '4.4',
      'Parent Access to Child Progress',
      'A parent links to a child using the admission number and date of birth; once the madrasa '
      + 'approves the link, the parent sees the child’s attendance, memorisation, grades, '
      + 'recitations and fees, and receives notifications.'),
    ...question(2, 'Would you pay madrasa fees through M-Pesa in a mobile application?', '4.5',
      'Willingness to Pay Fees via M-Pesa',
      'The parent pays one or several invoices through an M-Pesa prompt on their phone. The '
      + 'amount is calculated by the server, and the receipt appears in the app as soon as '
      + 'payment is confirmed.'),

    p('Student Questionnaire Analysis', { bold: true }),
    p('A total of [INSERT] students participated in the survey, with the consent of their '
      + 'parents. The purpose was to understand how recitation is practised and assessed.'),
    ...question(1, 'How does your teacher assess your recitation?', '4.6', 'Recitation Assessment Methods',
      'Students record a recitation in the app. The recording is stored privately, the teacher '
      + 'listens and gives a score and comments, and the student and approved parent see the '
      + 'review.'),
    ...question(2, 'Would recording your recitation on a phone help you practise?', '4.7',
      'Digital Recitation Practice',
      'The app lets students record as often as they need, shows the passages due for revision, '
      + 'and provides the Quran text for reading offline.'),

    h2('4.6 Secondary Data Collection'),
    p('Secondary data provided background that complemented the primary data. A review of '
      + 'academic literature, government reports and existing systems (Chapter Two) showed that '
      + 'madrasa records in Kenya are largely informal and unstandardised (Ndzovu, 2023), that '
      + 'the government plans to integrate madrasa education into the national system (Kihaki, '
      + '2026), and that parental involvement is associated with better achievement (Fan & Chen, '
      + '2001). It also showed that Kenya’s mobile penetration makes a phone-based system '
      + 'practical (Communications Authority of Kenya, 2023) and that automated tajweed '
      + 'assessment is not yet reliable enough to replace the teacher (Al-Kharusi et al., 2025). '
      + 'These findings reinforced the need for an integrated system that combines madrasa '
      + 'administration, Quran learning, parental access and fee management.'),

    h2('4.7 Requirements and Stakeholders Identification'),
    p('Based on the analysed data, the requirements were categorised as follows.'),
    p('Functional Requirements', { bold: true }),
    p('The system shall allow a madrasa owner to register the madrasa, admit students with '
      + 'automatically generated admission numbers, create classes, add teachers, define fee '
      + 'structures and issue invoices. Teachers shall take attendance manually or by QR code, '
      + 'record memorisation, set and mark assignments, grade students, review recitations and '
      + 'award certificates. Parents shall request a link to their child, view the approved '
      + 'child’s attendance, progress and invoices, pay fees by M-Pesa and message the madrasa. '
      + 'Students shall scan attendance codes, record recitations, hand in work and view their own '
      + 'progress. The system shall send notifications for announcements, invoices, payments and '
      + 'reviews, and provide role-based dashboards.'),
    p('Non-Functional Requirements', { bold: true }),
    p('The system shall keep each madrasa’s records private from every other madrasa and allow '
      + 'each user only the actions of their role. It shall respond quickly on mobile networks, '
      + 'protect passwords and data in transit, and store recitation audio privately. It shall be '
      + 'easy to use for people with limited experience of mobile applications and be available in '
      + 'English, Kiswahili, Somali and Arabic. Payments shall be settled exactly once for the '
      + 'amount the server calculates, and important actions shall be recorded in an audit log.'),
    p('Stakeholders Identification', { bold: true }),
    p('Madrasa owners register the madrasa, manage students, staff and fees, and oversee '
      + 'operations. Teachers take attendance, track memorisation, review recitations and '
      + 'communicate with parents. Parents follow their children’s progress and pay fees. Students '
      + 'record recitations, scan attendance and follow their own progress. A platform '
      + 'administrator oversees the madrasas using the service. Government education authorities '
      + 'influence the system indirectly through the plans to integrate madrasa education into the '
      + 'national system.'),

    h2('4.8 Challenges in Requirements Gathering and Analysis'),
    p('Several challenges influenced the requirements gathering process.'),
    p([{ text: 'Diverse stakeholder needs: ', bold: true },
       { text: 'owners prioritise records and fees, teachers prioritise simple attendance and '
               + 'review, and parents want timely information. Features were prioritised by how '
               + 'many roles they serve and how directly they address the problem statement.' }]),
    p([{ text: 'Limited stakeholder availability: ', bold: true },
       { text: 'madrasa sessions run early in the morning, in the evening and at weekends, which '
               + 'limited the time available for interviews and observation.' }]),
    p([{ text: 'Sensitivity of children’s data: ', bold: true },
       { text: 'information about minors requires consent and care. Questions were framed '
               + 'neutrally, students took part only with parental consent, and the system was '
               + 'designed so that a parent sees a child only after the madrasa approves the link.' }]),
    p([{ text: 'Technical constraints: ', bold: true },
       { text: 'features such as a validated tajweed recognition model and live M-Pesa '
               + 'credentials were beyond the project’s resources, so the system was designed to '
               + 'accept them later without redesign.' }]),
    p([{ text: 'Variations in madrasa practice: ', bold: true },
       { text: 'madrasas differ in class levels, fee structures and languages, so the system '
               + 'lets each madrasa define its own classes and fees and offers four languages.' }]),

    h2('4.9 Summary'),
    p('This chapter described how the requirements of Digital Madrasa were gathered and analysed '
      + 'from madrasa owners and teachers, parents, students and the literature. The system must '
      + 'provide secure sign-in, digital attendance, memorisation tracking, recitation review, '
      + 'parent access approved by the madrasa, fee invoicing with M-Pesa payment, notifications '
      + 'and role-based dashboards, while keeping each madrasa’s data private. These requirements '
      + 'form the foundation of the design presented in Chapter Five.'),
  ];
};
