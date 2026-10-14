const K = require('./kit');
const { p, chapter, h2, h3, bullet } = K;

module.exports = function ch2() {
  return [
    ...chapter('TWO', 'Literature Review'),

    h2('2.1 Introduction'),
    p('This chapter reviews the literature on madrasa education and administration in Kenya, the '
      + 'challenges of traditional madrasa management, and existing education management systems '
      + 'and Quran applications. It then discusses how a mobile-based integrated system can be '
      + 'designed, implemented and tested to address the gaps identified.'),

    h2('2.2 Challenges in Traditional Madrasa Administration and Quran Learning'),
    h3('2.2.1 Informal Record Keeping and Lack of Standardisation'),
    p('Quranic schools are among the oldest continuously operating educational institutions in '
      + 'the Muslim world. Boyle (2004) describes their core pedagogy as the memorisation and '
      + 'correct recitation of the Quran under the close supervision of a teacher. In Kenya this '
      + 'tradition is carried by the duksi, which concentrate on recitation and memorisation, and '
      + 'by madrasas, which add Arabic, Fiqh and Islamic history. Most are founded and run by '
      + 'communities, mosques or individual teachers rather than by the state.'),
    p('Aden (2017) notes that Islamic and secular education in Kenya have largely developed in '
      + 'parallel, with learners attending the madrasa before or after the public school day. '
      + 'Ndzovu (2023) highlights the absence of a standardised syllabus as a persistent issue, and '
      + 'the same lack of standardisation extends to records. An owner or head teacher admits '
      + 'learners, allocates them to classes and collects fees, while each teacher keeps his or '
      + 'her own notebook of attendance and of how far each learner has memorised. Such records '
      + 'are easily lost, give the institution no single view of a learner, and cannot identify a '
      + 'child who moves between classes or madrasas. With madrasas now to be integrated into the '
      + 'national education system (Kihaki, 2026), reliable records have become a necessity. The '
      + 'community Madrasa preschool programme, evaluated by Mwaura et al. (2008), shows that '
      + 'madrasa-linked education can be organised and assessed when it is structured.'),
    h3('2.2.2 Limited Parental Visibility and Assessment Workload'),
    p('Parents usually learn about attendance and progress informally, at pick-up or only when a '
      + 'problem has become serious. Fan and Chen (2001), in a meta-analysis, found a small to '
      + 'moderate but practically meaningful relationship between parental involvement and '
      + 'academic achievement, and Emerson et al. (2012) conclude that engagement is most '
      + 'effective when it is focused on the child’s own learning. Epstein (2018) identifies '
      + 'regular school-to-home communication as one of the core types of family involvement. '
      + 'A madrasa that cannot tell parents how their child is doing loses this support.'),
    p('Recitation must be heard to be assessed, so a teacher’s capacity to give individual '
      + 'tajweed feedback is limited by class size and time. In large classes learners may recite '
      + 'to the teacher only occasionally, and persistent errors can go uncorrected between '
      + 'sessions.'),
    h3('2.2.3 Financial, Logistical and Communication Barriers'),
    p('Madrasa fees are typically recorded by hand and reminded verbally. Payments made in cash or '
      + 'by M-Pesa are not linked to an invoice, which makes balances hard to reconcile and '
      + 'disputes hard to resolve. Communication between the madrasa and families relies on phone '
      + 'calls and word of mouth, and parents who speak Kiswahili, Somali or Arabic rather than '
      + 'English may be excluded from written notices. At the same time Kenya is highly connected: '
      + 'the Communications Authority of Kenya (2023) reported a mobile penetration of 131.3 per '
      + 'cent, and the Kenya National Digital Master Plan 2022–2032 commits the government to the '
      + 'digitisation of services (Ministry of ICT and the Digital Economy, 2022). The phone that '
      + 'parents already use for M-Pesa is therefore a practical channel for records, payments and '
      + 'notices.'),

    h2('2.3 Review of Existing Madrasa Management and Quran Learning Applications'),
    h3('2.3.1 Overview of Existing Education Management and Quran Applications'),
    p('National Education Management Information System (NEMIS). The Ministry of Education '
      + 'operates NEMIS, which links each learner to a unique identifier and reports national '
      + 'indicators for registered institutions (Ministry of Education, n.d.); a replacement, the '
      + 'Kenya Education Management Information System, was announced in 2025 (Tongola, 2025). It '
      + 'serves national reporting rather than the day-to-day running of a madrasa.'),
    p('Learning management systems. Moodle and Google Classroom provide courses, assignments, '
      + 'grading and messaging. Moodle was designed around social-constructivist learning '
      + 'communities (Dougiamas & Taylor, 2003).'),
    p('School administration software. Commercial products used in Kenyan schools focus on fee '
      + 'collection, examinations and communication for primary and secondary schools following '
      + 'the national curriculum.'),
    p('Quran applications. Tarteel listens to a user’s recitation, follows along in the text and '
      + 'flags memorisation mistakes such as skipped words (Tarteel AI, n.d.). Quran.com and '
      + 'similar readers provide the text, translations and audio by recognised reciters '
      + '(Quran.com, n.d.). Masalha and Hirzallah (2014) proposed a student attendance system in '
      + 'which learners scan a QR code to register their presence.'),
    h3('2.3.2 Usability, Accessibility and Functional Limitations'),
    p('Al-Fraihat et al. (2020) found that system, information and support quality together '
      + 'explain much of learners’ satisfaction with e-learning systems, and Coates, James and '
      + 'Baldwin (2005) caution that learning management systems tend to impose a generic model of '
      + 'teaching. None of the management systems reviewed tracks memorisation by juz, handles '
      + 'recitation audio or links a parent to a child through an approval process, and most are '
      + 'available only in English. Quran applications, in turn, are individual tools with no '
      + 'teacher, parent or institutional role and no attendance or fee records.'),
    p('Automated recitation assessment also has clear limits. Al-Ayyoub, Damer and Hmeidi (2018) '
      + 'reported over 97 per cent accuracy in classifying eight recitation rules on an in-house '
      + 'dataset, but Al-Kharusi et al. (2025) argue that the field relies on small and '
      + 'demographically biased datasets, and Alsharhan and Ramsay (2020) show that speaker gender, '
      + 'dialect and training size materially affect Arabic speech recognition. Automated tajweed '
      + 'feedback can therefore support, but not replace, the teacher. A static attendance QR code '
      + 'can be photographed and shared, so it proves presence only if it changes and is verified '
      + 'by the server.'),
    h3('2.3.3 Identified Gaps from Reviewed Systems'),
    p('The review identified the following gaps:'),
    bullet('No reviewed system combines madrasa administration with Quran learning.'),
    bullet('Parents have no structured, child-specific view of attendance, progress and fees.'),
    bullet('Fee payments are not linked to invoices and receipts.'),
    bullet('Automated tajweed assessment is not reliable enough to be authoritative.'),
    bullet('Shared platforms must keep each institution’s records separate.'),
    bullet('Interfaces are rarely available in the languages of Kenyan madrasa communities.'),

    h2('2.4 Development of a Mobile-Based Integrated Madrasa Management System'),
    h3('2.4.1 System Design and Architecture Overview'),
    p('Where many independent organisations share one application, the application is '
      + 'multi-tenant. Bezemer and Zaidman (2010) observe that multi-tenancy reduces operating '
      + 'cost but makes isolation between tenants a central engineering concern, and Alkhalil, '
      + 'Sahandi and John (2017) found that perceived security shapes the decision to move records '
      + 'into the cloud. Within each tenant, role-based access control assigns permissions to '
      + 'roles rather than individuals (Sandhu et al., 2000), which matches the owner, teacher, '
      + 'parent and student roles of a madrasa. The proposed system is therefore a single mobile '
      + 'application backed by a managed cloud database, in which each madrasa is a separate '
      + 'tenant and every user acts in one role.'),
    h3('2.4.2 Implementation Using React Native (Expo) and Supabase'),
    p('Cross-platform frameworks allow one codebase to serve several mobile platforms '
      + '(Biørn-Hansen et al., 2018). The system uses React Native with the Expo toolchain and '
      + 'TypeScript for the application, and Supabase for the backend: a PostgreSQL database, '
      + 'authentication, file storage for recitation audio, and server functions for privileged '
      + 'operations such as payments. PostgreSQL Row Level Security lets the database itself decide '
      + 'which rows each user may read or change (PostgreSQL Global Development Group, n.d.), so '
      + 'one madrasa’s records stay private even if the application code contains an error.'),
    h3('2.4.3 Integration of Administration and Quran Learning Modules'),
    p('The administration module covers admission, classes, staff, attendance, fees and '
      + 'communication; the learning module covers memorisation, assignments, grades, '
      + 'certificates and recitation review. They share one student record, so attendance, '
      + 'memorisation and fees appear together on the teacher’s and the parent’s screens. '
      + 'Holmes, Bialik and Fadel (2019) argue that artificial intelligence in education should '
      + 'augment rather than replace the teacher. VanLehn (2011) found that intelligent tutoring '
      + 'approached the effectiveness of human tutoring, and Neri, Cucchiarini and Strik (2008) '
      + 'showed that automatic pronunciation feedback improved learners’ speech. The system '
      + 'accordingly labels any automated recitation feedback as provisional and makes the '
      + 'teacher’s review final.'),
    h3('2.4.4 Expected Benefits to Kenyan Madrasas'),
    p('The integrated system is expected to give madrasas reliable records of enrolment, '
      + 'attendance and progress; give approved parents timely information about their children; '
      + 'reduce teachers’ clerical work; link fee payments to invoices and receipts through '
      + 'M-Pesa; and reach families in English, Kiswahili, Somali and Arabic.'),

    h2('2.5 Testing of the Digital Madrasa Mobile Application'),
    h3('2.5.1 Functionality and Performance Testing'),
    p('Sommerville (2016) distinguishes development testing of components, release testing '
      + 'against requirements, and user testing. For a multi-tenant system the most important '
      + 'functional tests are those that prove a user cannot reach another madrasa’s records or '
      + 'act outside their role; these must test refusals as well as successes. Performance testing '
      + 'checks that screens load quickly over mobile networks.'),
    h3('2.5.2 Usability and User Experience Evaluation'),
    p('Usability can be measured with the System Usability Scale, a ten-item questionnaire that '
      + 'yields a score from 0 to 100 (Brooke, 1996). It suits users with limited experience of '
      + 'mobile applications and can be administered in the local language.'),
    h3('2.5.3 Reliability and Field Testing Approach'),
    p('Reliability depends on the system behaving correctly with real data and devices. Testing '
      + 'against the deployed backend with test accounts for every role, followed by field testing '
      + 'in a pilot madrasa on the phones its teachers and parents already own, gives confidence '
      + 'that the system will work outside the development environment.'),

    h2('2.6 Summary'),
    p('This chapter reviewed madrasa education and administration in Kenya and the challenges of '
      + 'informal records, limited parental visibility, assessment workload and fee management. '
      + 'Existing education management systems and Quran applications each address only part of '
      + 'the problem, and none combines madrasa administration with Quran learning under strict '
      + 'separation of institutions. The chapter outlined how a multi-tenant mobile system built '
      + 'with React Native and Supabase can close this gap and how it should be tested. Chapter '
      + 'Three describes the development methodology.'),
  ];
};
