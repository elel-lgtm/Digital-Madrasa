import { formatHijri } from '@digital-madrasa/shared';
import QRCode from 'qrcode';

/**
 * The printable certificate, as HTML for the platform's PDF printer.
 *
 * Kept free of React Native imports so it can be unit-tested in Node. Every
 * value from the database is escaped: a pupil's name or a title must never
 * be able to inject markup into a document the family will print and share.
 */

export interface CertificateDocument {
  title: string;
  kindLabel: string;
  studentName: string;
  madrasaName: string;
  issuedAt: string;
  verificationCode: string;
  /** Where the QR code leads: the live, public verification page. */
  verifyUrl: string;
  /** Ijazah only: the chain of transmission, teacher before teacher. */
  sanad?: string[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function verifyUrlFor(supabaseUrl: string | null | undefined, code: string): string {
  const base = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/verify` : 'https://digitalmadrasa.app/verify';
  return `${base}?code=${encodeURIComponent(code)}`;
}

export async function certificateHtml(doc: CertificateDocument): Promise<string> {
  const qr = await QRCode.toString(doc.verifyUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
  const issued = new Date(doc.issuedAt);
  const gregorian = issued.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const e = escapeHtml;
  const sanad = doc.sanad && doc.sanad.length > 0
    ? `<div class="sanad"><div class="label">Chain of transmission (sanad)</div>${
      doc.sanad.map((n) => `<span>${e(n)}</span>`).join('<b> ← </b>')}</div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; color: #2b2116; }
  .page { width: 297mm; height: 210mm; padding: 12mm; background: #fbf7ee; }
  .frame { height: 100%; border: 3px solid #b8892c; outline: 1px solid #b8892c; outline-offset: -9px;
           padding: 14mm 18mm; position: relative; text-align: center; }
  .bismillah { font-size: 22pt; color: #8a6a1f; margin-bottom: 4mm; direction: rtl; }
  .madrasa { font-size: 13pt; letter-spacing: 3px; text-transform: uppercase; color: #6b5a3a; }
  h1 { font-size: 30pt; margin: 6mm 0 2mm; color: #2b2116; font-weight: normal; letter-spacing: 1px; }
  .kind { font-size: 12pt; color: #8a6a1f; text-transform: uppercase; letter-spacing: 2px; }
  .certifies { margin-top: 9mm; font-size: 12pt; color: #6b5a3a; font-style: italic; }
  .name { font-size: 28pt; margin: 3mm 0; border-bottom: 1px solid #b8892c; display: inline-block; padding: 0 12mm 2mm; }
  .title { font-size: 15pt; margin-top: 4mm; }
  .dates { margin-top: 6mm; font-size: 11pt; color: #6b5a3a; }
  .sanad { margin: 6mm auto 0; max-width: 200mm; font-size: 10pt; color: #4a3c25; }
  .sanad .label { font-size: 9pt; text-transform: uppercase; letter-spacing: 2px; color: #8a6a1f; margin-bottom: 1mm; }
  .footer { position: absolute; left: 18mm; right: 18mm; bottom: 12mm; display: flex; justify-content: space-between; align-items: flex-end; }
  .sign { width: 70mm; border-top: 1px solid #6b5a3a; padding-top: 2mm; font-size: 10pt; color: #6b5a3a; }
  .verify { display: flex; align-items: flex-end; gap: 4mm; text-align: left; }
  .qr { width: 30mm; height: 30mm; }
  .qr svg { width: 100%; height: 100%; }
  .code { font-family: 'Courier New', monospace; font-size: 14pt; letter-spacing: 3px; color: #2b2116; }
  .hint { font-size: 8pt; color: #6b5a3a; max-width: 52mm; }
</style></head>
<body><div class="page"><div class="frame">
  <div class="bismillah">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div>
  <div class="madrasa">${e(doc.madrasaName)}</div>
  <h1>Certificate</h1>
  <div class="kind">${e(doc.kindLabel)}</div>
  <div class="certifies">This is to certify that</div>
  <div class="name">${e(doc.studentName)}</div>
  <div class="title">${e(doc.title)}</div>
  <div class="dates">${e(gregorian)} &nbsp;·&nbsp; ${e(formatHijri(issued, 'en'))}</div>
  ${sanad}
  <div class="footer">
    <div class="sign">Teacher’s signature</div>
    <div class="verify">
      <div>
        <div class="hint">Scan to check this certificate is genuine, or enter the code in the ILMORA app.</div>
        <div class="code">${e(doc.verificationCode)}</div>
      </div>
      <div class="qr">${qr}</div>
    </div>
  </div>
</div></div></body></html>`;
}
