import { randomUUID } from 'node:crypto';
import { issueSignedToken, presignUrl } from '@vercel/blob';

export const maxImageSizeBytes = 5 * 1024 * 1024;
export const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

const extensionByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const uploadUrlDurationMs = 5 * 60 * 1000;

export function createImageUploadService({
  issueSignedToken: issueToken = issueSignedToken,
  presignUrl: createPresignedUrl = presignUrl,
  createId = randomUUID,
  now = Date.now,
} = {}) {
  return async function createImageUpload({ kind, contentType }) {
    if (!['cars', 'submissions'].includes(kind) || !extensionByType[contentType]) {
      throw new TypeError('Unsupported image upload scope or content type');
    }

    const pathname = `${kind}/${createId()}.${extensionByType[contentType]}`;
    const validUntil = now() + uploadUrlDurationMs;
    const token = await issueToken({
      pathname,
      operations: ['put'],
      allowedContentTypes: [contentType],
      maximumSizeInBytes: maxImageSizeBytes,
      validUntil,
    });
    const { presignedUrl } = await createPresignedUrl(token, {
      operation: 'put',
      pathname,
      access: 'public',
      allowedContentTypes: [contentType],
      maximumSizeInBytes: maxImageSizeBytes,
      validUntil,
      addRandomSuffix: false,
      allowOverwrite: false,
    });

    const parsedUrl = new URL(presignedUrl);
    if (parsedUrl.protocol !== 'https:'
      || !parsedUrl.hostname.endsWith('.public.blob.vercel-storage.com')) {
      throw new Error('Vercel Blob returned an invalid public upload URL');
    }
    parsedUrl.search = '';
    parsedUrl.hash = '';

    return { uploadUrl: presignedUrl, imageUrl: parsedUrl.toString() };
  };
}

export const createImageUpload = createImageUploadService();
