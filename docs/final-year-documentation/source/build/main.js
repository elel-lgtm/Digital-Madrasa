/**
 * Assembles the Digital Madrasa final-year project report.
 *
 *   FIGDIR=<figures dir> SCHEMA=<schema2.json> OUT=<file.docx> node main.js
 *
 * The table of contents and the lists of figures and tables are Word fields,
 * so their page numbers are produced by Word (topdf.ps1 updates them).
 * Chapters may contain { __section: 'landscape' | 'portrait' } markers; the
 * body is split at them into sections with continuous page numbering.
 * CHAPTERS=1,2,5 builds a subset (for quick checks).
 */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, PageBreak, Header, Footer,
  PageNumber, TableOfContents, LevelFormat, NumberFormat, SectionType, PageOrientation,
  convertInchesToTwip,
} = require('docx');

const K = require('./kit');
const front = require('./front');
const back = require('./back');

const OUT = process.env.OUT;
const BF = K.BODY_FONT;

const ALL = [1, 2, 3, 4, 5, 6, 7, 8];
const wanted = process.env.CHAPTERS ? process.env.CHAPTERS.split(',').map(Number) : ALL;
const chapters = wanted.map((n) => require(`./ch${n}`));
const withBack = !process.env.CHAPTERS;

const numbering = {
  config: [
    {
      reference: 'bullets',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
      ],
    },
    {
      reference: 'ordered',
      levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
      ],
    },
  ],
};

const footer = () => new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], size: 22, font: BF })],
  })],
});

// US Letter, 1-inch margins on every side, as in the reference report.
const margins = {
  top: convertInchesToTwip(1),
  right: convertInchesToTwip(1),
  bottom: convertInchesToTwip(1),
  left: convertInchesToTwip(1),
};
const letter = { width: K.PAGE.width, height: K.PAGE.height };
const landscapeMargins = {
  top: convertInchesToTwip(1),
  right: convertInchesToTwip(0.9),
  bottom: convertInchesToTwip(0.9),
  left: convertInchesToTwip(0.9),
};

function listHeading(text) {
  // Each list starts a new page; a heading with pageBreakBefore never leaves
  // an empty page behind when the previous list exactly fills its last page.
  return new Paragraph({
    pageBreakBefore: true,
    alignment: AlignmentType.CENTER,
    spacing: { after: 60, line: 240 },
    children: [new TextRun({ text, bold: true, size: 24, font: BF })],
  });
}

// Titles as the reference prints them. The lists themselves are Word fields
// (updated by topdf.ps1), so every page number is Word's, not typed.
function tocSection() {
  return [
    listHeading('Table of Contents'),
    new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }),
    listHeading('Table of figures'),
    new TableOfContents('Figures', {
      hyperlink: true, stylesWithLevels: [{ styleName: 'FigureCaption', level: 1 }],
    }),
    listHeading('Table of Tables'),
    new TableOfContents('Tables', {
      hyperlink: true, stylesWithLevels: [{ styleName: 'TableCaption', level: 1 }],
    }),
  ];
}

// Chapters are built before the lists so the figure and table registers fill.
const bodyItems = [
  ...chapters.flatMap((fn) => fn()),
  ...(withBack ? [...back.appendices(), ...back.references()] : []),
];

// Split at section markers.
const bodySections = [];
let current = { orientation: 'portrait', children: [] };
for (const item of bodyItems) {
  if (item && item.__section) {
    if (item.__section !== current.orientation) {
      if (current.children.length) bodySections.push(current);
      current = { orientation: item.__section, children: [] };
    }
    continue;
  }
  current.children.push(item);
}
if (current.children.length) bodySections.push(current);

/*
 * Page numbering, as in the reference:
 *   cover            no number (its own section, no footer)
 *   front matter     lower-case roman, starting at ii — the cover counts as i
 *                    but does not show it — declaration ii, dedication iii, …
 *   body             arabic, restarting at 1 on Chapter One and running
 *                    through the appendix and references
 */
const sections = [
  {
    properties: { page: { size: letter, margin: margins } },
    children: front.titlePage(),
  },
  {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: { size: letter, margin: margins, pageNumbers: { start: 2, formatType: NumberFormat.LOWER_ROMAN } },
    },
    footers: { default: footer() },
    children: [
      ...front.declaration(), ...front.dedication(), ...front.acknowledgement(), ...front.abstract(),
      ...tocSection(),
    ],
  },
  ...bodySections.map((sec, i) => ({
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: sec.orientation === 'landscape'
          ? { width: K.PAGE.width, height: K.PAGE.height, orientation: PageOrientation.LANDSCAPE }
          : letter,
        margin: sec.orientation === 'landscape' ? landscapeMargins : margins,
        pageNumbers: i === 0 ? { start: 1, formatType: NumberFormat.DECIMAL } : { formatType: NumberFormat.DECIMAL },
      },
    },
    footers: { default: footer() },
    children: sec.children,
  })),
];

const doc = new Document({
  creator: '[STUDENT FULL NAME]',
  title: 'Digital Madrasa, an Integrated Application That Will Manage Madrasas in Kenya',
  description: 'BSc Computer Science final-year project report, Umma University',
  numbering,
  styles: {
    default: {
      document: { run: { font: BF, size: 24 }, paragraph: { spacing: { line: 360 } } },
      heading1: { run: { font: BF, size: 28, bold: true, color: '000000' } },
      heading2: { run: { font: BF, size: 24, bold: true, color: '000000' } },
      heading3: { run: { font: BF, size: 24, bold: true, color: '000000' } },
      heading4: { run: { font: BF, size: 24, bold: true, italics: true, color: '000000' } },
    },
    paragraphStyles: [
      {
        id: 'FigureCaption', name: 'FigureCaption', basedOn: 'Normal', next: 'Normal', quickFormat: false,
        run: { font: BF, size: 24, italics: true },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { after: 220 } },
      },
      {
        id: 'TableCaption', name: 'TableCaption', basedOn: 'Normal', next: 'Normal', quickFormat: false,
        run: { font: BF, size: 24, italics: true },
        paragraph: { alignment: AlignmentType.CENTER, spacing: { before: 100, after: 240 } },
      },
    ],
  },
  sections,
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`  wrote ${OUT}  (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  sections: ${sections.length}   figures: ${K.state.figures.length}   tables: ${K.state.tables.length}`);
  const dup = (arr) => arr.map((x) => x.number).filter((n, i, a) => a.indexOf(n) !== i);
  console.log(`  duplicate figure numbers: ${dup(K.state.figures).join(', ') || 'none'}`);
  console.log(`  duplicate table numbers:  ${dup(K.state.tables).join(', ') || 'none'}`);
});
