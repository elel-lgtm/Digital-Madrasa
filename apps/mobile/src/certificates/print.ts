import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { env } from '@/config/env';
import { certificateHtml, verifyUrlFor, type CertificateDocument } from './html';

/**
 * Makes the certificate PDF and offers to share or save it. On the web the
 * browser's print dialog does the same job.
 */
export async function shareCertificatePdf(doc: Omit<CertificateDocument, 'verifyUrl'>): Promise<void> {
  const html = await certificateHtml({ ...doc, verifyUrl: verifyUrlFor(env.supabaseUrl, doc.verificationCode) });

  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }

  // A4 landscape, in points.
  const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: doc.title,
    });
  }
}

export { verifyUrlFor };
