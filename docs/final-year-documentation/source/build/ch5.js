const K = require('./kit');
const { p, chapter, h2, h3, figure } = K;

module.exports = function ch5() {
  return [
    ...chapter('FIVE', 'System Design'),

    h2('5.1 Introduction'),
    p('This chapter presents the design of Digital Madrasa. From the structure of the data and the '
      + 'database schema to the interactions between users and the system and the layout of the '
      + 'user interfaces, each part of the design was planned to meet the requirements identified '
      + 'in Chapter Four. Particular attention was given to role-based access for owners, '
      + 'teachers, parents and students, and to keeping each madrasa’s records separate from every '
      + 'other madrasa.'),

    h2('5.2 Structural Diagram'),
    p('Structural diagrams describe the static architecture of the system by showing its '
      + 'components, such as classes and their relationships (Sommerville, 2016). They provide a '
      + 'blueprint of how data and objects are organised and help developers understand how the '
      + 'parts of the system fit together.'),
    h3('5.2.1 Class Diagram'),
    p('The class diagram in Figure 5.1 shows the main classes of the system, their attributes and '
      + 'operations, and the relationships between them. A Madrasa has many students, teachers, '
      + 'classes, fee structures and announcements. A Student belongs to one madrasa and has '
      + 'attendance records, memorisation progress, recitations and invoices, and a Parent is '
      + 'connected to a Student through a ParentStudentLink that the madrasa approves. Each '
      + 'Recitation may receive TajweedFeedback, which the teacher reviews.'),
    ...figure('diagrams/fig5-class.png', '5.1', 'Class Diagram', 5.6),
    h3('5.2.2 Entity Relationship Diagram (ERD)'),
    p('The Entity Relationship Diagram in Figure 5.2 represents the core data of the system: the '
      + 'entities, their key attributes and the relationships between them, with cardinalities '
      + '(1 and N). It was generated from the live database, so it matches the implemented schema. '
      + 'Every record carries the identifier of its madrasa, which is how the database keeps each '
      + 'madrasa’s data separate.'),
    ...figure('erd/erd-core.png', '5.2', 'ERD Diagram', 6.0),

    h2('5.3 Behavioral Diagrams'),
    p('Behavioural diagrams illustrate how the system responds to user actions and internal '
      + 'events. They show the flow of activities, the order of operations and how each actor '
      + 'interacts with the system, and guide implementation decisions.'),
    h3('5.3.1 Use Case Diagram'),
    p('The system has four main users: the madrasa owner, the teacher, the parent and the student, '
      + 'with a platform administrator who oversees the madrasas. The owner registers the madrasa, '
      + 'admits students, manages classes and staff, and defines fees and issues invoices; because '
      + 'an owner is also a teacher, the owner can do everything a teacher does. Teachers take '
      + 'attendance, display the rotating QR code, record grades and assignments, review '
      + 'recitations and decide parent link requests. Students scan the class QR code, record '
      + 'recitations and view their progress. Parents create an account, request a link to their '
      + 'child, view the child’s progress and invoices and message the madrasa. Figure 5.3 shows '
      + 'these interactions.'),
    ...figure('diagrams/fig5-usecase.png', '5.3', 'Use Case Diagram', 5.8),
    h3('5.3.2 Sequence Diagram'),
    p('Sequence diagrams show the interactions between objects over time. Figure 5.4 shows '
      + 'recitation submission and review. The student’s app requests a private upload link, '
      + 'uploads the audio to storage and asks the server to evaluate it; the server stores the '
      + 'recitation and a provisional result. The teacher then opens the review queue, plays the '
      + 'recording through a short-lived link and saves a score, which the student and the '
      + 'approved parent can see.'),
    ...figure('diagrams/fig5-sequence.png', '5.4', 'Sequence Diagram', 6.3),
    h3('5.3.3 Activity Diagram'),
    p('The activity diagram in Figure 5.5 shows QR attendance. The teacher opens the class '
      + 'attendance screen and the system displays a signed code that changes every 30 seconds. A '
      + 'student scans the code, and the server checks the signature, the time window, the class '
      + 'and the student’s role before recording the student as present; an expired or wrong code '
      + 'is refused.'),
    ...figure('diagrams/fig5-activity-qr.png', '5.5', 'Activity Diagram', 4.6),

    h2('5.4 Database Schema'),
    p('The database schema defines how data is organised and stored. Digital Madrasa uses a '
      + 'PostgreSQL database of 42 tables grouped into functional areas: tenancy and identity, '
      + 'access control, learning, attendance, recitation, finance, subscription, communication '
      + 'and operations, as shown in Figure 5.6. Every table that belongs to a madrasa carries its '
      + 'madrasa identifier, and Row Level Security is enabled on all 42 tables so that users can '
      + 'read and change only the records their role allows.'),
    ...figure('diagrams/fig5-schema.png', '5.6', 'Database Schema', 6.2),

    h2('5.5 Wireframes'),
    p('The wireframes in Figure 5.7 illustrate the core user interfaces of the application: the '
      + 'sign-in screen, the teacher dashboard with attendance and fee summaries, QR attendance '
      + 'scanning, and the review screen shown before invoices are issued. They set out the main '
      + 'navigation and the flow of interaction that the implemented screens follow.'),
    ...figure('diagrams/fig5-wireframes.png', '5.7', 'Wireframes', 6.3),

    h2('5.6 Summary'),
    p('This chapter presented the design of Digital Madrasa. The class diagram and ERD define the '
      + 'main entities and their relationships, the use case diagram shows what each user can do, '
      + 'the sequence and activity diagrams describe recitation review and QR attendance, the '
      + 'database schema organises the 42 tables, and the wireframes give a visual overview of the '
      + 'interface. Together these form the blueprint for the development described in Chapter '
      + 'Six.'),
  ];
};
