/**
 * Document construction helpers for the Digital Madrasa final-year report.
 *
 * Everything academic in the report is assembled from these few primitives so
 * heading levels, caption numbering and table styling stay consistent across
 * eight chapters without being restated at every call site.
 */
const fs = require('fs');
const path = require('path');
const {
  Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak, ImageRun,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  TabStopType, TabStopPosition,
} = require('docx');

const FIGDIR = process.env.FIGDIR;
const BODY_FONT = 'Times New Roman';
const MONO = 'Consolas';

// Page is US Letter with 1-inch margins, as in the reference report; the
// text column is 6.5 in = 9360 DXA.
const COL = 9360;
const PAGE = { width: 12240, height: 15840 };

const state = { figures: [], tables: [], text: [] };

// ----------------------------------------------------------------- text
function p(text, opts = {}) {
  const {
    bold = false, italics = false, size = 24, align = AlignmentType.JUSTIFIED,
    spacing = { after: 160, line: 360 }, indent, font = BODY_FONT, color,
  } = opts;
  const runs = Array.isArray(text) ? text : [{ text }];
  state.text.push(runs.map((r) => r.text).join(''));
  return new Paragraph({
    alignment: align,
    spacing,
    indent,
    children: runs.map((r) => new TextRun({
      text: r.text,
      bold: r.bold ?? bold,
      italics: r.italics ?? italics,
      size: r.size ?? size,
      font: r.font ?? font,
      color: r.color ?? color,
    })),
  });
}

function centered(text, opts = {}) {
  return p(text, { align: AlignmentType.CENTER, ...opts });
}

const NUMBER_WORDS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8 };

/**
 * Chapter opener, as in the reference: "CHAPTER ONE" centred on a new page,
 * then the numbered chapter title ("1. INTRODUCTION") as the level-1 heading
 * that the table of contents lists.
 */
function chapter(number, title) {
  return [
    new Paragraph({
      pageBreakBefore: true,
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 240 },
      children: [new TextRun({ text: `CHAPTER ${number}`, bold: true, size: 32, font: BODY_FONT })],
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.LEFT,
      spacing: { before: 120, after: 200 },
      children: [new TextRun({ text: `${NUMBER_WORDS[number]}. ${title.toUpperCase()}`, bold: true, size: 28, font: BODY_FONT })],
    }),
  ];
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    keepLines: true,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, bold: true, size: 24, font: BODY_FONT })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    keepNext: true,
    keepLines: true,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, bold: true, size: 24, font: BODY_FONT })],
  });
}

function h4(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_4,
    keepNext: true,
    keepLines: true,
    spacing: { before: 180, after: 100 },
    children: [new TextRun({ text, bold: true, italics: true, size: 24, font: BODY_FONT })],
  });
}

function bullet(text, level = 0) {
  state.text.push(text);
  return new Paragraph({
    numbering: { reference: 'bullets', level },
    spacing: { after: 90, line: 340 },
    children: [new TextRun({ text, size: 24, font: BODY_FONT })],
  });
}

// Each numbered list restarts at 1 after restartList(); without it, Word would
// continue one list's numbering into the next.
let listInstance = 1;
function restartList() {
  listInstance += 1;
  return [];
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: 'ordered', level, instance: listInstance },
    spacing: { after: 90, line: 340 },
    children: [new TextRun({ text, size: 24, font: BODY_FONT })],
  });
}

function quote(text, source) {
  return [
    p(text, {
      italics: true, align: AlignmentType.CENTER, size: 24,
      spacing: { before: 120, after: 60, line: 320 },
    }),
    p(source, {
      align: AlignmentType.CENTER, size: 22,
      spacing: { after: 200 },
    }),
  ];
}

/**
 * Arabic runs need a face that is actually installed, or Word substitutes and the
 * verses render as boxes. Arial ships with Windows and carries full Arabic
 * coverage; the decorative Quranic faces do not and were dropped for that reason.
 */
function arabic(text) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    bidirectional: true,
    spacing: { before: 140, after: 80 },
    children: [new TextRun({ text, size: 32, font: 'Arial', rightToLeft: true })],
  });
}

function code(lines) {
  return lines.map((line, i) => new Paragraph({
    spacing: { after: i === lines.length - 1 ? 160 : 0, line: 260 },
    indent: { left: 340 },
    shading: { type: ShadingType.CLEAR, fill: 'F5F3EE' },
    children: [new TextRun({ text: line || ' ', size: 19, font: MONO })],
  }));
}

// -------------------------------------------------------------- figures
/**
 * Places a figure with its caption. `width` is in inches; the image is scaled
 * to preserve the aspect ratio recorded in the PNG header.
 */
function figure(file, number, title, widthIn = 6.0) {
  const full = path.join(FIGDIR, file);
  if (!fs.existsSync(full)) throw new Error(`missing figure: ${full}`);
  const buf = fs.readFileSync(full);
  // PNG: width and height are big-endian uint32 at bytes 16 and 20.
  const pxW = buf.readUInt32BE(16);
  const pxH = buf.readUInt32BE(20);
  const w = widthIn * 96;
  const h = Math.round((pxH / pxW) * w);
  state.figures.push({ number, title });
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      keepNext: true,
      spacing: { before: 200, after: 80 },
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: Math.round(w), height: h } })],
    }),
    new Paragraph({
      style: 'FigureCaption',
      alignment: AlignmentType.CENTER,
      spacing: { after: 220 },
      children: [new TextRun({ text: `Figure ${number} ${title}`, italics: true, size: 24, font: BODY_FONT })],
    }),
  ];
}

/** A visibly marked gap for evidence the researcher must supply. */
function placeholder(label, note) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 180, after: 40 },
      border: {
        top: { style: BorderStyle.DASHED, size: 6, color: 'A08B3C' },
        bottom: { style: BorderStyle.DASHED, size: 6, color: 'A08B3C' },
        left: { style: BorderStyle.DASHED, size: 6, color: 'A08B3C' },
        right: { style: BorderStyle.DASHED, size: 6, color: 'A08B3C' },
      },
      shading: { type: ShadingType.CLEAR, fill: 'FCF7E6' },
      children: [new TextRun({ text: label, bold: true, size: 22, color: '7A6520', font: BODY_FONT })],
    }),
    note ? p(note, { italics: true, size: 20, align: AlignmentType.CENTER, spacing: { after: 200 } })
         : new Paragraph({ spacing: { after: 160 }, children: [] }),
  ];
}

/**
 * A captioned evidence box for material only the developer can supply (a
 * GitHub page, a dashboard, a survey chart). It is registered in the List of
 * Figures like any real figure so the gap cannot be overlooked.
 */
// number === null draws the space alone, uncaptioned (the reference's A.4 and A.5).
function evidenceBox(number, title, lines, note, heightIn = 2.4) {
  if (number !== null) state.figures.push({ number, title });
  const dashed = { style: BorderStyle.DASHED, size: 12, color: 'A08B3C' };
  return [
    new Paragraph({ keepNext: true, spacing: { before: 160, after: 0 }, children: [] }),
    new Table({
      columnWidths: [COL - 1400],
      width: { size: COL - 1400, type: WidthType.DXA },
      alignment: AlignmentType.CENTER,
      rows: [new TableRow({
        cantSplit: true,
        height: { value: Math.round(heightIn * 1440), rule: 'atLeast' },
        children: [new TableCell({
          width: { size: COL - 1400, type: WidthType.DXA },
          verticalAlign: 'center',
          shading: { type: ShadingType.CLEAR, fill: 'FCF7E6' },
          borders: { top: dashed, bottom: dashed, left: dashed, right: dashed },
          children: lines.map((line, i) => new Paragraph({
            alignment: AlignmentType.CENTER,
            keepNext: true,
            keepLines: true,
            spacing: { after: 80 },
            children: [new TextRun({
              text: line, bold: i === 0, size: i === 0 ? 26 : 21,
              color: i === 0 ? '7A6520' : '5A5A5A', font: BODY_FONT,
            })],
          })),
        })],
      })],
    }),
    ...(number === null ? [new Paragraph({ spacing: { after: 200 }, children: [] })] : [
      new Paragraph({
        style: 'FigureCaption',
        alignment: AlignmentType.CENTER,
        keepNext: true,
        spacing: { before: 100, after: 60 },
        children: [new TextRun({ text: `Figure ${number} ${title}`, italics: true, size: 24, font: BODY_FONT })],
      }),
      p(note, { italics: true, size: 20, align: AlignmentType.CENTER, spacing: { after: 220 } }),
    ]),
  ];
}

function shotPlaceholder(number, title, what, heightIn = 2.4) {
  return evidenceBox(number, title, ['[INSERT SCREENSHOT HERE]', what],
    'Screenshot to be inserted by the developer.', heightIn);
}

function surveyPlaceholder(number, title, question, chartType = 'Pie chart') {
  return evidenceBox(number, title,
    ['[INSERT ACTUAL SURVEY RESULTS HERE]', `${chartType} of responses to: “${question}”`],
    'Chart to be produced from the actual questionnaire responses; no values are shown '
    + 'because no responses have been recorded in the project materials.', 2.0);
}

// --------------------------------------------------------------- tables
// opts.listed = false: an appendix table captioned as the reference does
// ("Table 8.1: Work Plan and Schedule") and left out of the Table of Tables.
function table(number, title, header, rows, widths, opts = {}) {
  const listed = opts.listed !== false;
  if (listed) state.tables.push({ number, title });
  const cols = widths || header.map(() => Math.floor(COL / header.length));
  const sum = cols.reduce((a, b) => a + b, 0);
  if (sum !== COL) cols[cols.length - 1] += COL - sum;

  const cell = (text, opts = {}) => new TableCell({
    width: { size: opts.w, type: WidthType.DXA },
    shading: opts.head ? { type: ShadingType.CLEAR, fill: 'EDE8DC' } : undefined,
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    children: String(text).split('\n').map((line) => new Paragraph({
      spacing: { after: 0, line: 260 },
      alignment: opts.head ? AlignmentType.LEFT : AlignmentType.LEFT,
      children: [new TextRun({ text: line, bold: !!opts.head, size: 20, font: BODY_FONT })],
    })),
  });

  return [
    new Paragraph({ keepNext: true, spacing: { before: 120, after: 0 }, children: [] }),
    new Table({
      columnWidths: cols,
      width: { size: COL, type: WidthType.DXA },
      rows: [
        new TableRow({
          tableHeader: true,
          children: header.map((t, i) => cell(t, { head: true, w: cols[i] })),
        }),
        ...rows.map((r) => new TableRow({
          children: r.map((t, i) => cell(t, { w: cols[i] })),
        })),
      ],
    }),
    new Paragraph({
      style: listed ? 'TableCaption' : undefined,
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 240 },
      children: [new TextRun({ text: listed ? `Table ${number} ${title}` : `Table ${number}: ${title}`, italics: true, size: 24, font: BODY_FONT })],
    }),
  ];
}

function dotted(left, right) {
  return new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX, leader: 'dot' }],
    spacing: { after: 60 },
    children: [new TextRun({ text: `${left}\t${right}`, size: 22, font: BODY_FONT })],
  });
}

/** Section markers: main.js splits the body at these into landscape/portrait sections. */
const landscape = () => ({ __section: 'landscape' });
const portrait = () => ({ __section: 'portrait' });

module.exports = {
  landscape, portrait,
  p, centered, chapter, h2, h3, h4, bullet, numbered, restartList, quote, arabic, code,
  figure, placeholder, table, dotted, state, COL, PAGE, BODY_FONT,
  evidenceBox, shotPlaceholder, surveyPlaceholder,
  Paragraph, TextRun, HeadingLevel, AlignmentType, PageBreak,
};
