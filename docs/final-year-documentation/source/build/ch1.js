const K = require('./kit');
const { p, chapter, h2, h3, numbered } = K;

module.exports = function ch1() {
  return [
    ...chapter('ONE', 'Introduction'),

    h2('1.1 Background of the Study'),
    p('The Holy Quran is memorised and recited by Muslims as the word of Allah (SWT), and its '
      + 'memorisation (Hifz) together with the rules of correct recitation (tajweed) has been passed '
      + 'down through Quranic schools for centuries. Boyle (2004) describes these schools as '
      + 'institutions that both preserve a religious tradition and adapt to the societies around '
      + 'them. In Kenya, and particularly in the Coast, North Eastern and Nairobi regions, they are '
      + 'known as duksi or madrasa. They meet in mosques, homes and community buildings, admit '
      + 'children from about four years of age and teach recitation, memorisation and basic '
      + 'religious knowledge. Mwaura, Sylva and Malmberg (2008) evaluated the community Madrasa '
      + 'preschool programme in Kenya, Uganda and Zanzibar and found measurable cognitive benefits '
      + 'for participating children, showing that madrasa-based education can be structured and '
      + 'assessed.'),
    p('The status of these institutions is changing. Ndzovu (2023) identifies the absence of a '
      + 'standardised syllabus and record-keeping as recurring concerns of the traditional madrassa '
      + 'system in Kenya, and in June 2026 the national government announced plans to integrate '
      + 'madrassa and duksi education into the national education system (Kihaki, 2026). '
      + 'Integration presupposes that a madrasa can produce reliable records of enrolment, '
      + 'attendance and learner progress, which most keep on paper or not at all.'),
    p('The conditions for a mobile solution are present. The Communications Authority of Kenya '
      + '(2023) reported 66.4 million mobile SIM subscriptions, a penetration rate of 131.3 per '
      + 'cent, and the Kenya National Digital Master Plan 2022–2032 makes the digitisation of '
      + 'services a national priority (Ministry of ICT and the Digital Economy, 2022). Consumer '
      + 'Quran applications already show that recitation practice can be supported on a phone, '
      + 'but they are built for individual learners and do not model the institution in which a '
      + 'teacher, a parent and a student share responsibility for a child’s progress. This project '
      + 'therefore developed the Digital Madrasa Mobile Application, a mobile application that '
      + 'brings madrasa administration and Quran learning together in one secure platform. Its '
      + 'branded implementation, ILMORA (Integrated Qur’an & Madrasa Learning), is the name users '
      + 'see in the application and in the screenshots of this report.'),

    h2('1.2 Problem Statement'),
    p('Madrasas in Kenya lack standardised systems for recording admission, attendance, '
      + 'memorisation progress and fees. Records are usually kept in exercise books held by '
      + 'individual teachers; they are easily lost, cannot be summarised for the institution and '
      + 'cannot be shared with parents. Parents therefore have little reliable information about '
      + 'whether their child attends, how far the child has memorised, or what fees are owed. '
      + 'Recitation can only be assessed when a teacher hears each learner in turn, so in large '
      + 'classes feedback is infrequent, and fees are collected in cash or by M-Pesa with no link to '
      + 'an invoice or receipt.'),
    p('Existing software addresses only parts of this problem. Quran applications support '
      + 'individual practice but have no teacher role, parental access, attendance register or fee '
      + 'records, while general school management systems have no Quran-specific functions such '
      + 'as memorisation tracking by juz or recitation review. Neither is designed for many '
      + 'independent madrasas, each of which must be able to trust that its records cannot be seen '
      + 'by another. There is therefore a need for a secure, multi-tenant mobile application that '
      + 'unifies madrasa administration with Quran learning.'),

    h2('1.3 Objectives'),
    h3('1.3.1 General Objective'),
    p('To develop an integrated mobile application for managing madrasas in Kenya that combines '
      + 'student administration, attendance, Quran memorisation and recitation review, parent '
      + 'involvement, and fee invoicing and payment within a single role-based platform.'),
    h3('1.3.2 Specific Objectives'),
    ...K.restartList(),
    numbered('To analyse the administrative and learning challenges facing madrasas in Kenya.'),
    numbered('To review existing education management systems and Quran applications and identify '
      + 'their limitations.'),
    numbered('To design and develop a multi-tenant, role-based mobile application for madrasa '
      + 'owners, teachers, parents and students covering admission, attendance, memorisation, '
      + 'recitation review, live lessons, parent linking, parent–teacher messaging, fees and '
      + 'M-Pesa payment.'),
    numbered('To test the developed system for functional correctness, data integrity and '
      + 'enforcement of authorisation between madrasas and roles.'),

    h2('1.4 Research Questions'),
    ...K.restartList(),
    numbered('What administrative and learning challenges do madrasas in Kenya face?'),
    numbered('What are the limitations of existing education management systems and Quran '
      + 'applications for madrasas?'),
    numbered('How can a multi-tenant mobile application integrate madrasa administration with '
      + 'Quran learning while keeping each madrasa’s records private?'),
    numbered('To what extent does the developed system meet its functional and security '
      + 'requirements when tested?'),

    h2('1.5 Justification'),
    p('Islam encourages seeking and spreading beneficial knowledge: “Allah will raise those who '
      + 'have believed among you and those who were given knowledge, by degrees” (Surah '
      + 'Al-Mujadilah 58:11). Within that motivation the project benefits each stakeholder. Madrasa '
      + 'owners gain institutional records of enrolment, attendance and fees, a practical '
      + 'precondition for integration into the national education system (Kihaki, 2026). Teachers '
      + 'have class rosters, attendance, recitation review and parent requests in one place. '
      + 'Parents see an approved child’s attendance, progress and fees; Fan and Chen (2001) found '
      + 'a meaningful relationship between parental involvement and academic achievement, and '
      + 'Epstein (2018) identifies regular school-to-home communication as a core form of '
      + 'involvement. Students can record a recitation for review without waiting for their turn '
      + 'in class.'),

    h2('1.6 Scope of the Project'),
    p('The project covers the design, development and testing of an Android application and its '
      + 'cloud backend for madrasas in Kenya. It serves four roles: the madrasa owner, the teacher, '
      + 'the parent and the student. The implemented scope includes madrasa registration and '
      + 'sign-in; student admission with system-generated admission numbers; classes and staff; '
      + 'manual and QR-code attendance; parent–child linking approved by the madrasa; memorisation '
      + 'tracking, assignments, grades and certificates; recitation recording with private audio '
      + 'storage, AI feedback given only with a parent’s consent, and teacher review; comparison '
      + 'with a master reciter, recite-along practice, a daily hifz plan, hifz streaks and badges and a class mistake map; '
      + 'a live reading room with scheduled sessions on Google Meet or Zoom; a library of '
      + 'teacher-chosen Quran videos; fee invoices paid by M-Pesa or card with receipts; '
      + 'sponsorship of pupils; announcements, parent–teacher messaging, notifications and spoken '
      + 'progress reports; attendance that can be marked offline; USSD access for basic phones; an '
      + 'impact dashboard; a web console for the platform administrator; and an interface in '
      + 'English, Kiswahili, Somali and Arabic. Curricula '
      + 'such as Tafsir and Fiqh, and the training of a dedicated tajweed recognition model, are '
      + 'outside the scope.'),

    h2('1.7 Limitations'),
    p('M-Pesa runs on Safaricom’s Daraja sandbox, which sends a real payment prompt to a '
      + 'Safaricom phone but moves only test money; accepting real fees needs a registered Paybill '
      + 'or Till number. Card payments, e-mail and SMS were exercised against mock providers that '
      + 'behave like the real services, because live Paystack and messaging credentials could not '
      + 'be obtained within the project. Video in live lessons is provided through Google Meet or '
      + 'Zoom links, because in-app video needs a paid provider; it is built but switched off. The '
      + 'installed app was tested on an Android '
      + 'emulator rather than a range of physical phones, and push notifications need a Firebase '
      + 'project to be configured before they can be delivered. The automated tajweed feedback '
      + 'comes from a general-purpose AI model (Google Gemini), not a validated tajweed assessor, '
      + 'so it is labelled provisional and the teacher’s review remains the authoritative '
      + 'assessment. No usability study with real users has yet been carried out, and the project '
      + 'evaluates whether the system works as specified, not its effect on memorisation over '
      + 'time.'),

    h2('1.8 Summary'),
    p('This chapter introduced the role of madrasas in Quran education in Kenya and the '
      + 'record-keeping, visibility and assessment problems they face as their integration into '
      + 'the national education system is planned. It stated the objectives and research '
      + 'questions of the project and set out its justification, scope and limitations. Chapter Two '
      + 'reviews the literature and existing systems.'),
  ];
};
