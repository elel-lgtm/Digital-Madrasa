const K = require('./kit');
const { p, chapter, h2, h3 } = K;

module.exports = function ch8() {
  return [
    ...chapter('EIGHT', 'Discussions, Future Works and Recommendations'),

    h2('8.1 Introduction'),
    p('This chapter reflects on the outcomes of Digital Madrasa in relation to the objectives of '
      + 'the project. It evaluates how far the system addresses the challenges of madrasa '
      + 'administration and Quran learning in Kenya, and identifies future work and '
      + 'recommendations.'),

    h2('8.2 Discussions of Objectives'),
    p('Objective 1', { bold: true, spacing: { after: 60 } }),
    p('The project analysed the challenges facing madrasas in Kenya: informal and unstandardised '
      + 'records, limited parental visibility, the workload of assessing recitation, and fees that '
      + 'are not linked to invoices. The system addresses them with digital records of admission, '
      + 'attendance and memorisation, parent access approved by the madrasa, recorded recitations '
      + 'for teacher review, and invoices with M-Pesa payment. The questionnaire results in Chapter '
      + 'Four are to be completed from the fieldwork.'),
    p('Objective 2', { bold: true, spacing: { after: 60 } }),
    p('The review of existing systems showed that Quran applications serve individual learners '
      + 'while education management systems have no Quran-specific functions, and that none keeps '
      + 'many independent madrasas separate. Digital Madrasa combines both in one platform, with '
      + 'each madrasa’s records isolated by the database and an interface in four languages.'),
    p('Objective 3', { bold: true, spacing: { after: 60 } }),
    p('The system was developed with React Native and Expo for the front end and Supabase for the '
      + 'backend. Owners, teachers, parents and students each have a dedicated dashboard, and '
      + 'admission, classes, manual and QR attendance, memorisation, assignments, recitation '
      + 'review with AI feedback, certificates, invoicing, M-Pesa and card payment, and '
      + 'notifications were implemented against the live backend. The application, branded '
      + 'ILMORA, also offers master-reciter comparison, recite-along practice, a daily hifz plan, '
      + 'hifz streaks and badges, a web console for the platform administrator, '
      + 'a live reading room with scheduled Meet or Zoom sessions, a teacher-chosen Quran video '
      + 'library, parent–teacher messaging, pupil sponsorship, spoken reports, USSD access, offline '
      + 'attendance and an impact dashboard.'),
    p('Objective 4', { bold: true, spacing: { after: 60 } }),
    p('Unit, functional and user interface testing confirmed that the core features work as '
      + 'required: all 185 unit tests and 78 functional test cases passed, 21 database suites '
      + 'proved 145 security guarantees, and the installed app passed 30 of 31 interface checks. '
      + 'M-Pesa is connected to Safaricom’s Daraja sandbox. The tests showed that users cannot reach records outside '
      + 'their madrasa or role. A usability study with real users, push notifications and testing '
      + 'on a range of physical phones remain to be done.'),

    h2('8.3 Future Work'),
    p('Although the system meets its main objectives, several enhancements would improve its '
      + 'reach and usefulness.'),
    h3('8.3.1 Deployment to Google Play Store'),
    p('Building the Android package and publishing the app on the Google Play Store would make '
      + 'installation easier and more trusted, provide automatic updates and allow feedback to be '
      + 'collected from users.'),
    h3('8.3.2 Development of Web-Based Admin Dashboard'),
    p('The platform administrator’s web console is now hosted and shows every madrasa, the '
      + 'platform’s impact and an audit log. It should be extended with downloadable reports and '
      + 'subscription management, so that the madrasas on the platform, their subscriptions and '
      + 'their activity can be monitored and acted on from a browser.'),
    h3('8.3.3 Integration of Push Notifications and Messaging'),
    p('Push, e-mail and SMS notifications and parent–teacher messaging are built. Configuring a '
      + 'Firebase project for push, connecting the real e-mail and SMS providers, a registered '
      + 'M-Pesa Paybill and Paystack, switching on in-app video for live lessons when a video '
      + 'provider can be funded, and confirming delivery on physical phones would give parents '
      + 'timely alerts about attendance, fees and reviews.'),
    h3('8.3.4 Smart Alerts and Recommendations'),
    p('The daily hifz plan and the teacher’s co-pilot already point to passages due for revision '
      + 'and to learners who fall behind. These could be extended into reminders based on spaced '
      + 'repetition (Kornell, 2009), and the general AI model now used for recitation feedback '
      + 'could be replaced with a tajweed model validated, with consent, on recordings of Kenyan '
      + 'learners.'),
    h3('8.3.5 Enhanced Offline Functionality'),
    p('Many madrasas have unreliable internet access. Attendance can already be marked offline '
      + 'and is sent when the connection returns, and USSD serves parents with basic phones. '
      + 'Extending this to memorisation records and recordings would make the system fully usable '
      + 'in such areas.'),

    h2('8.4 Recommendations'),
    p('To ensure the long-term success and adoption of the system, the following recommendations '
      + 'are proposed.'),
    h3('8.4.1 Continuous User Engagement'),
    p('Feedback should be collected regularly from owners, teachers, parents and students, '
      + 'beginning with a pilot in one madrasa, so that the system continues to meet real needs.'),
    h3('8.4.2 Strengthening Data Security'),
    p('Because the system holds children’s records, authorisation must remain in the database, '
      + 'every change to an access rule should be tested before deployment, and the Kenya Data '
      + 'Protection Act 2019 must be followed.'),
    h3('8.4.3 Regular System Updates'),
    p('The application should be updated regularly to fix defects, keep Expo, React Native and '
      + 'Supabase current, and add features requested by users.'),
    h3('8.4.4 Institutional and Government Collaboration'),
    p('Collaboration with madrasa associations and the Ministry of Education would support '
      + 'adoption and help align the system’s records with the planned integration of madrasa '
      + 'education into the national system (Kihaki, 2026; Tongola, 2025).'),
    h3('8.4.5 Optimization for Low-End Devices'),
    p('The application should be optimised for the low-cost smartphones common among families, by '
      + 'reducing its size and data usage and testing it on such devices.'),

    h2('8.5 Summary'),
    p('This chapter discussed how the Digital Madrasa Mobile Application (ILMORA) addressed the challenges of madrasa '
      + 'administration and Quran learning in Kenya. The system brings records, attendance, '
      + 'memorisation, recitation review, parent access and fee payment into one secure platform. '
      + 'Future work includes publishing on the Google Play Store, reports in the web console, live '
      + 'notifications and payments, in-app video, smart revision alerts and fuller offline '
      + 'support, while the '
      + 'recommendations emphasise user engagement, data security, regular updates, institutional '
      + 'collaboration and optimisation for low-end devices.'),
  ];
};
