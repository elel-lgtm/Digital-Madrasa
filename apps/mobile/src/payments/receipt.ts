import { BRAND, formatMoney, type Invoice, type Payment } from '@digital-madrasa/shared';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { escapeHtml } from '@/certificates/html';

export interface ReceiptDocument {
  payment: Payment;
  invoices: Invoice[];
  madrasaName: string;
  /** Labels in the reader's language. */
  labels: Record<
    'title' | 'code' | 'receiptNo' | 'date' | 'paidFrom' | 'method' | 'paidTo' | 'forItems' | 'amount' | 'test' | 'footer',
    string
  >;
  methodLabel: string;
  dateLabel: string;
}

/** A one-page receipt, in the shape a bursar would file. */
export function receiptHtml(doc: ReceiptDocument): string {
  const p = doc.payment;
  const l = doc.labels;
  const row = (k: string, v: string) =>
    `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`;
  const items = doc.invoices
    .map((i) => `<li>${escapeHtml(i.studentName)} — ${escapeHtml(i.description)} <span>${escapeHtml(i.invoiceNo)}</span></li>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, Roboto, 'Segoe UI', sans-serif; color: #1d1a16; margin: 0; padding: 48px; }
  .card { max-width: 520px; margin: 0 auto; border: 1px solid #ddd3c2; border-radius: 14px; overflow: hidden; }
  .head { background: #0E3B3A; color: #F7F0E1; padding: 22px 28px; }
  .brand { font-size: 22px; letter-spacing: 4px; font-weight: 700; }
  .sub { color: #D4AF37; font-size: 11px; letter-spacing: 1px; margin-top: 2px; }
  .body { padding: 24px 28px; }
  h1 { font-size: 15px; text-transform: uppercase; letter-spacing: 1.5px; color: #6b5f50; margin: 0 0 6px; }
  .amount { font-size: 34px; font-weight: 700; margin: 0 0 4px; }
  .code { font-family: 'Courier New', monospace; font-size: 18px; letter-spacing: 2px; color: #1f7a1f; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 13px; }
  td { padding: 8px 0; border-bottom: 1px solid #eee6d8; vertical-align: top; }
  td.k { color: #6b5f50; width: 40%; }
  ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; }
  li span { color: #6b5f50; }
  .test { margin-top: 16px; padding: 8px 12px; background: #fff4d6; border-radius: 8px; font-size: 12px; color: #7a5a00; }
  .foot { padding: 14px 28px 22px; font-size: 11px; color: #8a7d6c; }
  </style></head><body><div class="card">
  <div class="head"><div class="brand">${escapeHtml(BRAND.name)}</div><div class="sub">${escapeHtml(BRAND.descriptor)}</div></div>
  <div class="body">
    <h1>${escapeHtml(l.title)}</h1>
    <div class="amount">${escapeHtml(formatMoney(p.amount, p.currency))}</div>
    ${p.providerRef ? `<div class="code">${escapeHtml(p.providerRef)}</div>` : ''}
    <table>
      ${p.providerRef ? row(l.code, p.providerRef) : ''}
      ${p.receiptNo ? row(l.receiptNo, p.receiptNo) : ''}
      ${row(l.date, doc.dateLabel)}
      ${row(l.method, doc.methodLabel)}
      ${p.payerPhone ? row(l.paidFrom, p.payerPhone) : p.cardLast4 ? row(l.paidFrom, `•••• ${p.cardLast4}`) : ''}
      ${row(l.paidTo, doc.madrasaName)}
    </table>
    ${items ? `<div style="margin-top:16px;font-size:13px;color:#6b5f50">${escapeHtml(l.forItems)}</div><ul>${items}</ul>` : ''}
    ${p.isTest !== false ? `<div class="test">${escapeHtml(l.test)}</div>` : ''}
  </div>
  <div class="foot">${escapeHtml(l.footer)}</div>
  </div></body></html>`;
}

export async function shareReceiptPdf(doc: ReceiptDocument): Promise<void> {
  const html = receiptHtml(doc);
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: doc.labels.title });
  }
}
