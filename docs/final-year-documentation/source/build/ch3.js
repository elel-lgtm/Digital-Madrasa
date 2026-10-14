const K = require('./kit');
const { p, chapter, h2, h3, bullet, figure } = K;

module.exports = function ch3() {
  return [
    ...chapter('THREE', 'System Development Methodology'),

    h2('3.1 Introduction'),
    p('This chapter presents the methodology adopted in developing Digital Madrasa. It describes '
      + 'the software development approach and the phases followed in building a working system '
      + 'that addresses the challenges faced by madrasas in Kenya. Because the system serves four '
      + 'different roles and combines administration with Quran learning, a flexible and '
      + 'iterative approach was needed to accommodate refinement at every stage. For this reason '
      + 'the Agile software development methodology was adopted.'),

    h2('3.2 Methodological Approach'),
    p('Agile emphasises working software, collaboration and responding to change over following '
      + 'a fixed plan (Beck et al., 2001). It delivers a usable version of the software early and '
      + 'improves it in short cycles called sprints, each ending with a working increment that can '
      + 'be reviewed (Schwaber & Sutherland, 2020). Unlike the Waterfall model, in which each '
      + 'phase is completed before the next begins, Agile allows requirements to be refined as the '
      + 'system takes shape (Sommerville, 2016).'),
    p('Agile suits this project because madrasa practices vary and many requirements, such as how '
      + 'parents should be linked to children or how fees should be targeted, became clear only when '
      + 'a working version could be tried. Each sprint delivered one complete capability, from the '
      + 'database rules to the screens, and was verified against the live backend before the next '
      + 'began.'),
    ...figure('diagrams/fig3-1-agile.png', '3.1', 'Agile Methodology', 5.2),

    h2('3.3 Agile Development Phases'),
    p('The development of Digital Madrasa followed six Agile phases: requirements, design, '
      + 'development, testing, deployment and review. Each phase contributed incrementally to the '
      + 'project’s objectives.'),
    h3('3.3.1 Requirements Phase'),
    p('Requirements were identified from the literature on madrasa education and parental '
      + 'involvement, from a review of existing education management systems and Quran '
      + 'applications, and from the questionnaire and interview instruments prepared for madrasa '
      + 'stakeholders (Appendix A.1). They were organised into two modules:'),
    bullet('Administration module: madrasa registration, student admission, classes, staff, '
      + 'attendance, fees and payments, announcements and messages.'),
    bullet('Quran learning module: memorisation progress, assignments, grades, recitation '
      + 'recording and review, and certificates.'),
    h3('3.3.2 Design Phase'),
    p('The design phase translated the requirements into the models presented in Chapter Five: '
      + 'the class diagram, the entity relationship diagram and database schema, use case, '
      + 'sequence and activity diagrams, and wireframes of the main screens. The architecture was '
      + 'built around React Native with Expo for the mobile interface and Supabase for '
      + 'authentication, the PostgreSQL database, file storage and server functions. Security '
      + 'rules were designed into the database from the start, so that each madrasa’s records are '
      + 'isolated by Row Level Security.'),
    h3('3.3.3 Development Phase'),
    p('Development proceeded in sprints recorded in the project’s Git history. The first sprint '
      + '(23 August 2026) produced the multi-tenant database, authentication and the screens for '
      + 'all four roles. The second (16 September) added the server functions, automated backups '
      + 'and continuous integration. Later sprints connected the live backend and the recitation '
      + 'storage workflow (19 September), teacher recitation review and parent access to a child’s '
      + 'recitations (22–23 September), QR attendance (23 September) and targeted invoicing '
      + '(24 September). The sprint of 25–30 September added written work and certificates, '
      + 'M-Pesa payments, push, e-mail and SMS notifications, and complete Kiswahili, Somali and '
      + 'Arabic translations. The final sprint (30 September – 2 October) connected Google Gemini '
      + 'for recitation feedback and a hosted AI assistant, added parental consent for AI '
      + 'feedback, card payments through Paystack, and fixes found by testing the installed '
      + 'app.'),
    h3('3.3.4 Testing Phase'),
    p('Testing was carried out after each sprint to verify that new features worked and did not '
      + 'break existing ones. The testing types included:'),
    bullet('Unit testing: verifying individual functions such as input validation, QR token '
      + 'signing and M-Pesa callback handling.'),
    bullet('Functional testing: scripted calls to the deployed backend as each role, checking that '
      + 'permitted actions succeed and forbidden ones are refused.'),
    bullet('User interface testing: checking each screen on an Android emulator and in the web '
      + 'build at phone size.'),
    bullet('Performance testing: measuring response times of the main screens and database '
      + 'queries.'),
    h3('3.3.5 Deployment Phase'),
    p('The database, storage and server functions were deployed to a hosted Supabase project '
      + 'from the first sprint, so every increment was tested against the real backend. During '
      + 'development the mobile application ran through Expo Go; at the end, Expo Application '
      + 'Services built an installable Android package (APK), which was installed and tested on an '
      + 'Android emulator.'),
    h3('3.3.6 Review Phase'),
    p('At the end of each sprint the working increment was reviewed against the requirements, and '
      + 'defects found in testing were fixed before new work began. Reviews led, for example, to '
      + 'the rotating QR code for attendance, to requiring the madrasa’s approval before a parent '
      + 'can see a child, and to a faster form of the database access rules after performance '
      + 'testing.'),

    h2('3.4 Summary'),
    p('The Agile methodology was adopted because it allows flexibility, continuous review and '
      + 'delivery of working software in short cycles. Through its six phases of requirements, '
      + 'design, development, testing, deployment and review, the project was developed '
      + 'iteratively, with each sprint delivering and verifying one complete capability of the '
      + 'system.'),
  ];
};
