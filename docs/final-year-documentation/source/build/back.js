const K = require('./kit');
const { Paragraph, TextRun, AlignmentType, PageBreak, HeadingLevel } = require('docx');
const { p, h2, h3, table, evidenceBox } = K;

/**
 * References (APA 7). Only sources cited in the text are listed, and each was
 * checked against the publisher, DOI or official page before inclusion.
 * Text between asterisks is set in italics.
 */
const REFS = [
  'Aden, A. A. (2017). Integration of Islamic and secular education in Kenya: A synthesis of the literature. *International Journal of Social Science and Humanities Research, 5*(3), 67–75.',
  'Al-Ayyoub, M., Damer, N. A., & Hmeidi, I. (2018). Using deep learning for automatically determining correct application of basic Quranic recitation rules. *The International Arab Journal of Information Technology, 15*(3A), 620–625.',
  'Al-Fraihat, D., Joy, M., Masa’deh, R., & Sinclair, J. (2020). Evaluating e-learning systems success: An empirical study. *Computers in Human Behavior, 102*, 67–86.',
  'Al-Kharusi, M. H., Hayat, K., Al Ruqeishi, K. B., & Lone, H. R. (2025). *A critical review of the need for knowledge-centric evaluation of Quranic recitation* (arXiv:2510.12858). arXiv. https://arxiv.org/abs/2510.12858',
  'Alkhalil, A., Sahandi, R., & John, D. (2017). An exploration of the determinants for decision to migrate existing resources to cloud computing using an integrated TOE-DOI model. *Journal of Cloud Computing, 6*(1). https://doi.org/10.1186/s13677-016-0072-x',
  'Alsharhan, E., & Ramsay, A. (2020). Investigating the effects of gender, dialect, and training size on the performance of Arabic speech recognition. *Language Resources and Evaluation, 54*, 975–998.',
  'Beck, K., Beedle, M., van Bennekum, A., Cockburn, A., Cunningham, W., Fowler, M., Grenning, J., Highsmith, J., Hunt, A., Jeffries, R., Kern, J., Marick, B., Martin, R. C., Mellor, S., Schwaber, K., Sutherland, J., & Thomas, D. (2001). *Manifesto for Agile software development*. Agile Alliance. https://agilemanifesto.org/',
  'Bezemer, C.-P., & Zaidman, A. (2010). Multi-tenant SaaS applications: Maintenance dream or nightmare? In *Proceedings of the Joint ERCIM Workshop on Software Evolution (EVOL) and International Workshop on Principles of Software Evolution (IWPSE)* (pp. 88–92). ACM. https://doi.org/10.1145/1862372.1862393',
  'Biørn-Hansen, A., Grønli, T.-M., & Ghinea, G. (2018). A survey and taxonomy of core concepts and research challenges in cross-platform mobile development. *ACM Computing Surveys, 51*(5), Article 108. https://doi.org/10.1145/3241739',
  'Boyle, H. N. (2004). *Quranic schools: Agents of preservation and change*. RoutledgeFalmer.',
  'Brooke, J. (1996). SUS: A “quick and dirty” usability scale. In P. W. Jordan, B. Thomas, B. A. Weerdmeester, & I. L. McClelland (Eds.), *Usability evaluation in industry* (pp. 189–194). Taylor & Francis.',
  'Coates, H., James, R., & Baldwin, G. (2005). A critical examination of the effects of learning management systems on university teaching and learning. *Tertiary Education and Management, 11*(1), 19–36.',
  'Communications Authority of Kenya. (2023). *Sector statistics report Q4 2022/2023*. Communications Authority of Kenya.',
  'Crompton, H., & Burke, D. (2020). Mobile learning and pedagogical opportunities: A configurative systematic review of PreK-12 research using the SAMR framework. *Computers & Education, 156*, 103945. https://doi.org/10.1016/j.compedu.2020.103945',
  'Dougiamas, M., & Taylor, P. C. (2003). Moodle: Using learning communities to create an open source course management system. In *Proceedings of EdMedia: World Conference on Educational Media and Technology 2003* (pp. 171–178). AACE.',
  'Emerson, L., Fear, J., Fox, S., & Sanders, E. (2012). *Parental engagement in learning and schooling: Lessons from research*. Australian Research Alliance for Children and Youth for the Family–School and Community Partnerships Bureau.',
  'Epstein, J. L. (2018). *School, family, and community partnerships: Preparing educators and improving schools* (2nd ed.). Routledge.',
  'Fan, X., & Chen, M. (2001). Parental involvement and students’ academic achievement: A meta-analysis. *Educational Psychology Review, 13*(1), 1–22. https://doi.org/10.1023/A:1009048817385',
  'Garrison, D. R. (2017). *E-learning in the 21st century: A community of inquiry framework for research and practice* (3rd ed.). Routledge.',
  'Holmes, W., Bialik, M., & Fadel, C. (2019). *Artificial intelligence in education: Promises and implications for teaching and learning*. Center for Curriculum Redesign.',
  'Kihaki, M. (2026, June 1). Madrassa and Duksi to be integrated into the education system. *The Standard*.',
  'Kornell, N. (2009). Optimising learning using flashcards: Spacing is more effective than cramming. *Applied Cognitive Psychology, 23*(9), 1297–1317. https://doi.org/10.1002/acp.1537',
  'Masalha, F., & Hirzallah, N. (2014). A students attendance system using QR code. *International Journal of Advanced Computer Science and Applications, 5*(3), 75–79. https://doi.org/10.14569/IJACSA.2014.050310',
  'Ministry of Education. (n.d.). *NEMIS*. Republic of Kenya. Retrieved September 26, 2026, from https://www.education.go.ke/nemis',
  'Ministry of ICT and the Digital Economy. (2022). *The Kenya national digital master plan 2022–2032*. Government of Kenya.',
  'Mwaura, P. A. M., Sylva, K., & Malmberg, L.-E. (2008). Evaluating the Madrasa preschool programme in East Africa: A quasi-experimental study. *International Journal of Early Years Education, 16*(3), 237–255. https://doi.org/10.1080/09669760802357121',
  'Ndzovu, H. (2023). The madrassa system and the Islamic-integrated schools: Competing spaces for learning and the ambivalent relations with secular education in Kenya. *Journal for Islamic Studies, 41*(1). https://doi.org/10.25159/2957-9163/15080',
  'Neri, A., Cucchiarini, C., & Strik, H. (2008). The effectiveness of computer-based speech corrective feedback for improving segmental quality in L2 Dutch. *ReCALL, 20*(2), 225–243.',
  'PostgreSQL Global Development Group. (n.d.). Row security policies. In *PostgreSQL 17 documentation*. Retrieved September 26, 2026, from https://www.postgresql.org/docs/17/ddl-rowsecurity.html',
  'Quran.com. (n.d.). *Quran.com* [Website]. Retrieved September 26, 2026, from https://quran.com',
  'Sandhu, R., Ferraiolo, D., & Kuhn, R. (2000). The NIST model for role-based access control: Towards a unified standard. In *Proceedings of the Fifth ACM Workshop on Role-Based Access Control* (pp. 47–63). ACM. https://doi.org/10.1145/344287.344301',
  'Schwaber, K., & Sutherland, J. (2020). *The Scrum guide*. Scrum.org. https://scrumguides.org/',
  'Sommerville, I. (2016). *Software engineering* (10th ed.). Pearson.',
  'Tarteel AI. (n.d.). *Tarteel: AI Quran memorization* [Mobile application]. Google Play. Retrieved September 26, 2026, from https://play.google.com/store/apps/details?id=com.mmmoussa.iqra',
  'Tongola, M. (2025, May 15). New education data system to replace NEMIS unveiled. *The Standard*. https://standardmedia.co.ke/article/2001519176/new-education-data-system-to-replace-nemis-unveiled',
  'VanLehn, K. (2011). The relative effectiveness of human tutoring, intelligent tutoring systems, and other tutoring systems. *Educational Psychologist, 46*(4), 197–221. https://doi.org/10.1080/00461520.2011.611369',
];

// Numbered, as in the reference: "1. Author (year) ...".
function refParagraph(text, i) {
  const runs = [new TextRun({ text: `${i + 1}. `, size: 24, font: K.BODY_FONT }),
    ...text.split('*').map((seg, k) => new TextRun({
      text: seg, italics: k % 2 === 1, size: 24, font: K.BODY_FONT,
    }))];
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { after: 120, line: 300 },
    indent: { left: 432, hanging: 432 },
    children: runs,
  });
}

function topHeading(text, alignment = AlignmentType.LEFT) {
  return [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
      alignment,
      spacing: { before: 240, after: 320 },
      children: [new TextRun({ text, bold: true, size: 28, font: K.BODY_FONT })],
    }),
  ];
}

// A source is listed only if the text cites it: its first author (or
// organisation) followed, within a citation, by its year.
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function cited(ref, text) {
  const cut = Math.min(...[ref.indexOf(','), ref.indexOf('. (')].filter((i) => i > 0));
  const author = ref.slice(0, cut).trim();
  const year = (ref.match(/\((\d{4}|n\.d\.)/) || [])[1];
  return new RegExp(`${escapeRe(author)}[^()]{0,80}(\\(|, )${escapeRe(year)}`).test(text);
}

function references() {
  const text = K.state.text.join('\n');
  const list = REFS.filter((r) => cited(r, text)).sort((a, b) => a.localeCompare(b));
  const left = REFS.filter((r) => !cited(r, text)).map((r) => r.slice(0, 22));
  console.log(`  references: ${list.length} cited; left out (not cited): ${left.join(' | ') || 'none'}`);
  return [...topHeading('REFERENCES', AlignmentType.CENTER), ...list.map(refParagraph)];
}

const opt = (...o) => o.map((x) => p(`☐ ${x}`, { spacing: { after: 20, line: 300 }, align: AlignmentType.LEFT }));
const q = (n, text) => p(`Question ${n}: ${text}`, { bold: true, spacing: { before: 120, after: 60 } });

function appendices() {
  return [
    ...topHeading('Appendix'),
    // ---------------------------------------------------------------- A.1
    h2('A.1: User Survey Questionnaire'),
    h3('Section A: Madrasa Owner and Teacher Questionnaire'),
    q(1, 'How is student attendance currently recorded in your madrasa?'),
    ...opt('Exercise book or register', 'Wall chart', 'Teacher’s memory only', 'Not recorded', 'Other (please specify): __________'),
    q(2, 'How is a student’s Quran memorisation progress recorded?'),
    ...opt('Written in a book', 'Teacher remembers', 'Told to the parent verbally', 'Not recorded', 'Other (please specify): __________'),
    q(3, 'How are fees recorded and communicated to parents?'),
    ...opt('Written receipt book', 'Verbal reminder', 'M-Pesa messages only', 'No formal record', 'Other (please specify): __________'),
    h3('Section B: Parent Questionnaire'),
    q(1, 'How do you currently learn about your child’s attendance and progress?'),
    ...opt('Told at pick-up', 'Phone call from the teacher', 'Parents’ meeting', 'I am not informed', 'Other (please specify): __________'),
    q(2, 'Would you pay madrasa fees through M-Pesa in a mobile application?'),
    ...opt('Yes', 'Maybe', 'No'),
    h3('Section C: Student Questionnaire'),
    q(1, 'How does your teacher assess your recitation?'),
    ...opt('I recite to the teacher in class', 'The teacher listens to a group together', 'Rarely assessed', 'Other (please specify): __________'),
    q(2, 'Would recording your recitation on a phone help you practise?'),
    ...opt('Strongly agree', 'Agree', 'Neutral', 'Disagree', 'Strongly disagree'),

    // ---------------------------------------------------------------- A.2
    h2('A.2: Work Plan and Schedule'),
    ...table('8.1', 'Work Plan and Schedule', ['Task', 'Start Date', 'End Date', 'Duration', 'Development Description'], [
      ['Requirement Gathering', '[INSERT DATE]', '[INSERT DATE]', '[INSERT]', 'Identify user roles and madrasa requirements; literature review'],
      ['System Design & Wireframing', '[INSERT DATE]', '[INSERT DATE]', '[INSERT]', 'Diagrams, database schema and wireframes'],
      ['Supabase Setup & Core Platform', '[INSERT DATE]', '2026-08-23', '[INSERT]', 'Multi-tenant database, authentication and screens for all roles'],
      ['Edge Functions, CI & Backups', '2026-08-24', '2026-09-16', '24 days', 'Server functions, build configuration, automated checks and backups'],
      ['Backend Integration & Recitation', '2026-09-17', '2026-09-23', '7 days', 'Live backend, recitation storage, teacher review and parent access'],
      ['QR Attendance & Invoicing', '2026-09-23', '2026-09-24', '2 days', 'Rotating QR attendance and targeted invoices'],
      ['Learning, Payments & Notifications', '2026-09-25', '2026-09-29', '5 days', 'Written work, certificates, M-Pesa payments, notifications and translations'],
      ['System Testing & Validation', '2026-09-19', '2026-09-30', '12 days', 'Unit, functional, user interface and performance testing'],
      ['Final Documentation & Deployment', '2026-09-30', '[INSERT DATE]', '[INSERT]', 'Report, APK build and presentation'],
    ], [2500, 1300, 1300, 1000, 3260], { listed: false }),

    // ---------------------------------------------------------------- A.3
    h2('A.3: Budget'),
    ...table('8.2', 'Budget', ['Items', 'Quantity', 'Cost (KES)', 'Total Cost (KES)', 'Notes'], [
      ['Internet data bundles', '3 months', '2,000', '6,000', 'Development, testing and backend access'],
      ['Transport & field data collection', '–', '–', '4,000', 'Visiting madrasas for questionnaires and interviews'],
      ['Printing, binding & documentation', '–', '–', '3,500', 'Final report copies'],
      ['Google Play developer registration', '1', '3,250', '3,250', 'One-time US$ 25, when the app is published'],
      ['Supabase backend services', '1', '0', '0', 'Free plan'],
      ['M-Pesa, e-mail & SMS services', '–', '–', '0', 'Mock providers during development; pay per use when live'],
      ['Development tools (VS Code, Expo, GitHub)', '–', '0', '0', 'Free and open source'],
      ['Test device (Android phone)', '1', '[INSERT]', '[INSERT]', 'Existing device, or cost if purchased'],
      ['Contingency (unexpected costs)', '–', '–', '1,675', '10% of paid items'],
      ['Total Estimated Budget', '', '', '18,425', 'Plus a test device if purchased'],
    ], [2900, 1100, 1100, 1400, 2860], { listed: false }),

    // ---------------------------------------------------------------- A.4
    h2('A.4: My Project Repository'),
    p([{ text: 'Repository link: ', bold: true }, { text: '[INSERT GITHUB REPOSITORY LINK]' }]),
    ...evidenceBox(null, '', ['[INSERT SCREENSHOT HERE]', 'GitHub repository home page after the final push'], '', 3.2),

    // ---------------------------------------------------------------- A.5
    h2('A.5: Plagiarism Report'),
    ...evidenceBox(null, '', ['[INSERT PLAGIARISM REPORT HERE]', 'Similarity report issued by the university’s plagiarism checker'], '', 4.0),
  ];
}

module.exports = { references, appendices, REFS };
