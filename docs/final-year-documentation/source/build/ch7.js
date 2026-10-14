const K = require('./kit');
const { p, chapter, h2, h3, bullet, table } = K;

const W = [1000, 1500, 2300, 2000, 1400, 1160];

module.exports = function ch7() {
  return [
    ...chapter('SEVEN', 'System Testing and Deployment'),

    h2('7.1 Introduction'),
    p('Testing and deployment are critical phases in the development of Digital Madrasa. Testing '
      + 'ensures that the application meets its functional and security requirements and gives '
      + 'owners, teachers, parents and students a reliable experience. Deployment makes the system '
      + 'available to its users. This chapter describes the testing carried out, its results, and '
      + 'how the system is deployed now and will be deployed in future.'),

    h2('7.2 System Testing and Validation'),
    p('The system was tested at several levels: unit testing of individual functions, functional '
      + 'testing of complete features against the deployed backend as each role, and user '
      + 'interface testing of the screens. Because the most important requirement is that no '
      + 'madrasa can see another’s records and no user can act outside their role, tests checked '
      + 'that forbidden actions are refused as well as that permitted ones succeed.'),
    h3('7.2.1 Unit Tests'),
    p('Unit testing examines individual components in isolation. Unit tests were written with '
      + 'Vitest for the logic that does not need a server: input validation, QR token signing, '
      + 'M-Pesa and card payment handling, notification rules, memorisation totals, recitation '
      + 'assessment, the AI assistant’s check on figures, the hifz plan, master-reciter timing, '
      + 'video links and the offline attendance queue. All 172 unit tests in 22 test files passed '
      + 'when run on 15 October 2026. Table 7.1 shows representative cases.'),
    ...table('7.1', 'Unit Testing', ['Test Case ID', 'Module', 'Test Case Description', 'Expected Result', 'Actual Result', 'Status'], [
      ['UT01', 'Validation', 'A payment request that includes an amount', 'Amount removed; server derives it', 'As expected', 'Pass'],
      ['UT02', 'QR tokens', 'Token from an old window, or forged', 'Token rejected', 'As expected', 'Pass'],
      ['UT03', 'M-Pesa callback', 'Customer cancels the payment prompt', 'Recorded as failed; nothing credited', 'As expected', 'Pass'],
      ['UT04', 'Memorisation', 'Overlapping memorisation records', 'Each juz counted once', 'As expected', 'Pass'],
      ['UT05', 'Notifications', 'User has switched SMS off', 'No SMS sent', 'As expected', 'Pass'],
      ['UT06', 'Video library', 'A link that is not from YouTube', 'Link refused', 'As expected', 'Pass'],
      ['UT07', 'Offline queue', 'Register saved with no connection', 'Kept on the phone; sent once on reconnect', 'As expected', 'Pass'],
    ], W),
    h3('7.2.2 Functional Testing'),
    p('Functional testing verifies that each feature works as the requirements specify. Scripts '
      + 'signed in as test accounts for every role and called the deployed backend; in total 78 '
      + 'functional test cases were run and all passed. In addition, 21 database verification '
      + 'suites, run against the live database on 15 October 2026, proved 145 security '
      + 'guarantees, such as that a parent sees only their own children and that a pupil cannot '
      + 'join another class’s reading room; all passed. Key functionalities tested include:'),
    bullet('Sign-in and role-based access: each role reaches its own dashboard and is refused '
      + 'actions of other roles.'),
    bullet('Attendance, invoicing, M-Pesa and card payment, notifications, written work, '
      + 'certificates, and AI recitation feedback only with consent.'),
    bullet('Live lessons, the reading room, the video library, parent–teacher messaging, '
      + 'sponsorship and the impact dashboard, each limited to the right madrasa, class and role.'),
    ...table('7.2', 'Functional Testing', ['Test Case ID', 'Feature', 'Test Scenario', 'Expected Outcome', 'Actual Outcome', 'Status'], [
      ['FT01', 'Admission', 'Owner admits a student; a parent tries to', 'Number DM-YYYY-NNNN issued; parent refused', 'As expected', 'Pass'],
      ['FT02', 'QR attendance', 'Student scans a valid code, then an expired one', 'Marked present once; expired code refused', 'As expected', 'Pass'],
      ['FT03', 'Invoicing', 'Owner issues invoices to one class', 'One invoice per student of that class', 'As expected', 'Pass'],
      ['FT04', 'M-Pesa payment', 'Parent pays an invoice', 'Invoice paid; receipt issued; parent notified', 'As expected', 'Pass'],
      ['FT05', 'AI feedback', 'Recitation from a pupil without parental consent', 'Nothing sent to the AI; no score given', 'As expected', 'Pass'],
      ['FT06', 'M-Pesa failure', 'Customer cancels or lacks funds', 'Payment failed with the reason; invoice still due', 'As expected', 'Pass'],
      ['FT07', 'Messaging', 'Parent writes to a teacher of another child', 'Message refused', 'As expected', 'Pass'],
    ], W),
    h3('7.2.3 User Interface (UI) Testing'),
    p('User interface testing checks that the application is easy to use and visually consistent. '
      + 'It was carried out on an Android emulator, in the web build at phone size, and finally on '
      + 'the installed Android package (APK) built by Expo Application Services. Key areas tested '
      + 'were:'),
    bullet('Navigation: tabs and buttons lead to the correct screens for each role.'),
    bullet('Forms and input fields: admission, invoice and payment forms validate input and show '
      + 'clear messages.'),
    bullet('Languages: labels fit and read correctly in English, Kiswahili, Somali and Arabic.'),
    bullet('Visual consistency: fonts, colours, icons and buttons are consistent across screens.'),
    bullet('Offline use: with the connection cut, the last screens stay visible and the attendance '
      + 'register is saved on the phone, then sent when the connection returns.'),
    p('On the installed app, recording, the offline library with the network switched off, the '
      + 'mirrored Arabic layout, camera permissions, confirmation dialogs, the AI assistant, '
      + 'parental consent and card payment were all exercised. Six defects found during UI testing '
      + 'were fixed: the parent inbox failed to display some notification types; tab labels were '
      + 'cut off in some languages; Arabic headings were drawn on the wrong side; the scanner did '
      + 'not notice a camera permission granted in Settings; the microphone message was not '
      + 'translated; and an unassessed recording was praised. Push notifications remain to be '
      + 'verified, because they need a Firebase project to be configured.'),
    ...table('7.3', 'User Interface Testing', ['Test Case ID', 'UI Element', 'Test Scenario', 'Expected Result', 'Actual Result', 'Status'], [
      ['UI01', 'Sign-in screen', 'Layout at phone size', 'Clean and responsive', 'As expected', 'Pass'],
      ['UI02', 'Dashboard', 'Role-based display', 'Correct dashboard per role', 'As expected', 'Pass'],
      ['UI03', 'Arabic layout', 'Installed app in Arabic', 'Screens mirrored right to left', 'As expected after fix', 'Pass'],
      ['UI04', 'Forms', 'Data entry and validation', 'Easy input and clear feedback', 'As expected', 'Pass'],
      ['UI05', 'Inbox', 'Display of notifications', 'All notices shown correctly', 'As expected after fix', 'Pass'],
    ], W),

    h2('7.3 Testing Results'),
    p('Testing produced positive results across all major parts of the system. Table 7.4 summarises '
      + 'the results. Of the 31 user interface checks, 30 passed, six of them after a defect was '
      + 'fixed; push notifications are still to be verified once Firebase is configured. In-app '
      + 'video was not tested because it is switched off.'),
    ...table('7.4', 'Testing Results', ['Testing Type', 'Total Test Cases', 'Passed', 'Failed', 'Success Rate'], [
      ['Unit Testing', '172', '172', '0', '100%'],
      ['Functional Testing', '78', '78', '0', '100%'],
      ['Database Security Guarantees', '145', '145', '0', '100%'],
      ['UI Testing', '31', '30', '0', '100% of tests run (1 pending)'],
    ], [2400, 1800, 1300, 1300, 2560]),

    h2('7.4 System Deployment'),
    p('Deployment prepares the system for real use. The backend of Digital Madrasa is deployed on a '
      + 'hosted Supabase project: the database with its 41 migrations and security policies, '
      + 'private storage for recitation audio, and 18 Edge Functions for operations such as '
      + 'invoicing, M-Pesa payments, notifications, AI feedback, spoken reports, USSD and the AI '
      + 'assistant. Automated checks run '
      + 'on GitHub for every change, and the database is backed up every three days.'),
    h3('7.4.1 Current Deployment Methods'),
    p('The mobile application is built as an installable Android package (APK) with Expo '
      + 'Application Services (EAS) and connects to the live backend. The APK is distributed '
      + 'directly:'),
    bullet('Direct APK sharing: the APK file is shared through Google Drive, Bluetooth or USB, and '
      + 'users install it by allowing installation from unknown sources.'),
    bullet('WhatsApp distribution: the APK is shared as a document on WhatsApp, which madrasa '
      + 'owners, teachers and parents already use.'),
    h3('7.4.2 Future Deployment Plans'),
    bullet('Google Play Store: publishing the app will make installation easier and more trusted, '
      + 'and provide automatic updates.'),
    bullet('Live payment and messaging services: moving M-Pesa from the Daraja sandbox to a '
      + 'registered Paybill or Till, and connecting Paystack for cards, the e-mail and SMS '
      + 'providers, and Firebase for push notifications, with real credentials.'),
    bullet('In-app video: switching on the built in-app video for live lessons once a funded '
      + 'video provider account is available.'),
    bullet('Web-based dashboard: hosting the platform administrator’s web console so that the '
      + 'madrasas on the platform can be managed from a browser.'),

    h2('7.5 Summary'),
    p('This chapter presented the testing and deployment of the Digital Madrasa Mobile '
      + 'Application (ILMORA). Unit, functional, database security and user interface testing showed that the core features, including sign-in, admission, '
      + 'attendance, invoicing, M-Pesa and card payment, AI feedback with consent and parent access, '
      + 'work as required on the installed app, and that users cannot reach records outside their '
      + 'madrasa or role. The backend is deployed on Supabase, the app is shared as an APK, and '
      + 'future plans include the Google Play Store, live payment and messaging services, and a '
      + 'hosted web dashboard.'),
  ];
};
