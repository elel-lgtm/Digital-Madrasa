const K = require('./kit');
const { p, chapter, h2, h3, figure, shotPlaceholder } = K;

const PHONE = 2.6;   // width of a phone screenshot, as in the reference's dashboards

module.exports = function ch6() {
  return [
    ...chapter('SIX', 'System Development'),

    h2('6.1 Introduction'),
    p('This chapter presents the development of the Digital Madrasa Mobile Application, '
      + 'implemented under the brand ILMORA. It outlines the tools, '
      + 'technologies and techniques used, describes the interfaces through which each user '
      + 'interacts with the system, and discusses the challenges encountered during development '
      + 'and how they were addressed. The aim is to show how the designs of Chapter Five were '
      + 'turned into a working mobile application.'),

    h2('6.2 System Development Tools and Techniques'),
    p('The system was built with tools chosen for cross-platform mobile development, secure data '
      + 'management and low cost. The front end is a single React Native codebase and the back end '
      + 'is a hosted Supabase project, so the same application serves every role while the '
      + 'database enforces what each role may see and do.'),
    h3('6.2.1 Integrated Development Environment (IDE)'),
    p('Visual Studio Code was used as the main integrated development environment. It provides '
      + 'TypeScript language support that reports errors as code is written, an integrated terminal '
      + 'for running the Expo development server and the test scripts, and Git integration for '
      + 'version control. The Android emulator from Android Studio was used to run the application '
      + 'during development, and the web build was used to check screens at phone size.'),
    ...shotPlaceholder('6.1', 'Visual Studio Code',
      'VS Code with the Digital Madrasa project open (explorer showing apps, packages and supabase)', 2.6),
    h3('6.2.2 Front-end Development'),
    p('The front end was developed with React Native and the Expo toolchain (SDK 54) in TypeScript, '
      + 'which lets one codebase run on Android devices and in a web browser. Expo Router organises '
      + 'the screens into separate groups for the owner, teacher, parent and student, so each user '
      + 'sees a dashboard tailored to their role. TanStack Query keeps data from the server up to '
      + 'date, and i18next provides the interface in English, Kiswahili, Somali and Arabic. The '
      + 'front end includes sign-up and sign-in screens, dashboards, student admission and class '
      + 'management, attendance with a QR scanner that also works offline, recitation recording '
      + 'and practice, the live reading room, the video library, fee and payment screens with '
      + 'receipts, and announcements, messages and notifications.'),
    h3('6.2.3 Database Management Tools'),
    p('Supabase was used to manage the data collected by the app. It provides a PostgreSQL '
      + 'database, user authentication, private file storage for recitation audio, and Edge '
      + 'Functions that run privileged operations, such as issuing invoices, starting M-Pesa '
      + 'payments and delivering notifications, on the server. The database schema was created '
      + 'through 41 version-controlled migrations, and Row Level Security policies on every table '
      + 'keep each madrasa’s records private. Supabase Realtime carries the live reading room on '
      + 'private channels that only the class may join. Outside services are called only from the '
      + 'server functions: Google Gemini, which listens to a recitation (when a parent has given '
      + 'consent), answers the AI assistant’s questions and speaks progress reports; Safaricom '
      + 'Daraja, which sends the M-Pesa payment prompt to the parent’s phone; and Paystack, whose '
      + 'hosted page takes card payments so that card numbers never pass through the app. Quran '
      + 'videos are played through YouTube’s embedded player from links the teacher chooses, so no '
      + 'YouTube API key is needed.'),
    ...shotPlaceholder('6.2', 'Supabase Setup',
      'Supabase dashboard showing the project’s tables (Table Editor) or Edge Functions', 2.6),

    h2('6.3 System Interfaces'),
    p('ILMORA, the branded implementation of the Digital Madrasa Mobile Application, provides '
      + 'interfaces tailored to each user role. All screens follow the same '
      + 'layout, with a bottom navigation bar, clear headings and summary cards, so that users with '
      + 'different levels of experience can move through the application easily. The following '
      + 'screenshots, captured on an Android phone screen, show the interfaces that users interact '
      + 'with.'),
    p('Sign Up Interface', { bold: true }),
    p('A new user chooses to register a madrasa or to create a parent account. Figure 6.3 shows '
      + 'the parent sign-up form, which collects the parent’s name, e-mail address, phone number and '
      + 'password, and asks for consent under the Kenya Data Protection Act 2019.'),
    ...figure('mobile/signup.png', '6.3', 'App Interface Sign Up', PHONE),
    p('Owner Interface', { bold: true }),
    p('The owner’s dashboard (Figure 6.4) shows the number of students, attendance for the week, '
      + 'fees collected and outstanding, pending parent link requests and today’s classes, with '
      + 'tabs for students, classes, fees and more.'),
    ...figure('mobile/owner.png', '6.4', 'Owner Dashboard', PHONE),
    p('Teacher Interface', { bold: true }),
    p('The teacher’s dashboard (Figure 6.5) lists the teacher’s classes with a shortcut to mark '
      + 'attendance, together with parent requests and summary figures for the madrasa.'),
    ...figure('mobile/teacher.png', '6.5', 'Teacher Dashboard', PHONE),
    p('Parent Interface', { bold: true }),
    p('The parent’s dashboard (Figure 6.6) lets a parent switch between approved children and see '
      + 'each child’s admission number, memorisation, attendance rate, outstanding balance and '
      + 'recent attendance, with tabs for fees, the inbox and messages.'),
    ...figure('mobile/parent.png', '6.6', 'Parent Dashboard', PHONE),
    p('Student Interface', { bold: true }),
    p('The student’s dashboard (Figure 6.7) shows the passages due for revision with a button to '
      + 'start a recitation, the juz memorised, attendance, overall progress and assignments.'),
    ...figure('mobile/student.png', '6.7', 'Student Dashboard', PHONE),
    p('Recitation, Live Learning and Badge Interfaces', { bold: true }),
    p('Figure 6.8 shows the learning features. A teacher reviewing a recitation can play the '
      + 'pupil and a master reciter ayah by ayah; in the live reading room pupils raise their hands, the teacher chooses a reader, '
      + 'the ayah is highlighted on every phone and the teacher marks the reading; the video '
      + 'library plays the Quran videos the teacher has chosen for the class; and badges, worked '
      + 'out from the pupil’s own records, encourage the pupil.'),
    ...figure('mobile/learning.png', '6.8', 'Recitation, Live Learning and Badge Interfaces', 6.2),
    p('Payment, Messaging and Offline Interfaces', { bold: true }),
    p('Figure 6.9 shows the parent paying a fee by M-Pesa, the receipt with its M-Pesa '
      + 'transaction code, a conversation between a parent and a teacher, and the attendance '
      + 'register saved on the phone while offline and sent when the connection returns.'),
    ...figure('mobile/payments.png', '6.9', 'Payment, Messaging and Offline Interfaces', 6.2),

    h2('6.4 Challenges Encountered During Development'),
    p('Several challenges arose during development and were addressed as follows.'),
    h3('6.4.1 Technical Complexities'),
    p('Supporting many madrasas and four roles in one system required every rule about who may see '
      + 'what to be written into the database as Row Level Security policies, and tested with '
      + 'accounts for every role. Performance testing showed that the original rule for reading a '
      + 'child’s records became slower as the platform grew, so it was rewritten to be evaluated '
      + 'once per query and proven by a test to allow exactly the same records. Handling money '
      + 'also required care: the app never sends an amount, and a payment is settled on the server '
      + 'exactly once. Some features cannot be tested in Expo Go and needed an installable build; '
      + 'testing that build revealed that Arabic headings were drawn on the wrong side because '
      + 'React Native swaps left and right in a right-to-left layout, which was then fixed. A '
      + 'general AI model also had to be kept honest: given silence and the expected text, one '
      + 'model reported a perfect recitation, so the audio is now first transcribed without the '
      + 'text and checked in code before any score is given. Later features raised further '
      + 'issues: a reading-room channel had to admit only the pupils, parents and teachers of that '
      + 'class, so access is decided by a database rule; and attendance saved without a connection '
      + 'was at first held back by the data library until the network returned, so the register is '
      + 'now kept on the phone and sent automatically on reconnection.'),
    h3('6.4.2 User Adoption and Resistance'),
    p('Some owners, teachers and parents have little experience with mobile applications and may '
      + 'prefer familiar paper registers. To encourage adoption the interfaces were kept simple, '
      + 'with large buttons and clear summaries, the application was translated into Kiswahili, '
      + 'Somali and Arabic, and payment uses M-Pesa, which families already use, or a card. AI '
      + 'feedback on a child’s voice is off until a parent turns it on.'),
    h3('6.4.3 Economic Constraints'),
    p('Limited resources affected the choice of tools. Free and open-source tools were used '
      + 'throughout: Expo, React Native, Visual Studio Code, the free tier of Supabase, the free '
      + 'tier of Google Gemini and Safaricom’s free Daraja sandbox. The in-app video provider '
      + 'that was evaluated required a payment card, so live lessons use free Google Meet or Zoom '
      + 'links, and the video code was kept separate so it can be switched on when funding '
      + 'allows. Card payments, e-mail and SMS were developed against mock providers; the same '
      + 'code switches to the real services when credentials are configured.'),
    h3('6.4.4 Continuous Updates and Supports'),
    p('Long-term use requires ongoing maintenance. Database changes are made through numbered '
      + 'migrations, automated checks run on every change pushed to GitHub, and the database is '
      + 'backed up every three days. Keeping Expo, React Native and Supabase up to date and '
      + 'responding to feedback from madrasas will keep the system reliable.'),

    h2('6.5 Summary'),
    p('This chapter described the development of the Digital Madrasa Mobile Application '
      + '(ILMORA): Visual Studio Code as the '
      + 'development environment, React Native with Expo for the front end, and Supabase for the '
      + 'database, authentication, storage and server functions. It presented the sign-up screen and '
      + 'the main interfaces, and discussed the challenges of '
      + 'technical complexity, user adoption, limited resources and continuous maintenance, '
      + 'together with how each was addressed.'),
  ];
};
