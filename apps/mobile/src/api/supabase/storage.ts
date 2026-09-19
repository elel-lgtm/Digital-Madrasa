import { File } from 'expo-file-system';
import { ApiError } from '../types';
import { supabase } from './client';
import { invokeFunction } from './functions';

/**
 * Uploads to the private Storage buckets.
 *
 * The client never picks where a file lands. It asks an Edge Function for a
 * signed upload URL, and the function builds the path from the caller's own
 * tenant — `madrasa/{madrasaId}/recitations/{uuid}`. That shape is not
 * cosmetic: the Storage policy reads the madrasa id straight out of the object
 * name via `storage_madrasa_id()`, so a client able to choose its own path
 * could write into another madrasa's folder. Handing path construction to the
 * server removes that possibility rather than guarding against it.
 *
 * The bytes go straight from the device to Storage. They never pass through
 * the Edge Function, which keeps a multi-megabyte upload out of its memory and
 * off its execution time.
 */

/**
 * The `recitations` bucket's own limit, mirrored here so an oversized file is
 * refused before it is read into memory and pushed over a mobile connection.
 * The bucket remains the real boundary — this is the courtesy check, not the
 * enforcement.
 */
export const RECITATION_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Container types the bucket and the Edge Function both accept. Kept in sync
 * with `ALLOWED_AUDIO` in supabase/functions/evaluate-recitation.
 */
const AUDIO_TYPES: Record<string, string> = {
  '.m4a': 'audio/m4a',
  '.mp4': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

interface SignedUpload {
  path: string;
  token: string;
  signedUrl: string;
}

/**
 * Reads a recorded file, checks it is something the server will accept, and
 * uploads it to the private `recitations` bucket.
 *
 * Returns the storage path to hand to the evaluation step. The caller must not
 * substitute the local URI for it: the two look alike in a type signature and
 * behave nothing alike at the far end.
 */
export async function uploadRecitationAudio(localUri: string): Promise<string> {
  if (!localUri) {
    throw new ApiError('validation', 'There is no recording to send.');
  }

  const file = new File(localUri);

  if (!file.exists) {
    throw new ApiError('validation', 'That recording is no longer on the device.');
  }

  const size = file.size ?? 0;
  if (size === 0) {
    throw new ApiError('validation', 'That recording is empty. Try recording again.');
  }
  if (size > RECITATION_MAX_BYTES) {
    const mb = (size / 1024 / 1024).toFixed(1);
    throw new ApiError(
      'validation',
      `That recording is ${mb} MB. Recordings must be under 10 MB — try a shorter passage.`,
    );
  }

  const contentType = AUDIO_TYPES[file.extension.toLowerCase()];
  if (!contentType) {
    throw new ApiError('validation', 'That audio format is not supported.');
  }

  // The function validates the content type again and applies its own rate
  // limit, so a client that skipped the checks above still gets nowhere.
  const upload = await invokeFunction<SignedUpload>('evaluate-recitation', {
    body: { action: 'upload-url', contentType },
  });

  const bytes = await file.bytes();

  const { error } = await supabase.storage
    .from('recitations')
    .uploadToSignedUrl(upload.path, upload.token, bytes, { contentType });

  if (error) {
    // The transport message can name buckets and policies; the user gets the
    // outcome and the console keeps the detail.
    console.warn('[recitation upload]', error.message);
    throw new ApiError('unknown', 'The recording could not be uploaded. Please try again.');
  }

  return upload.path;
}
