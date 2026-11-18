import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';

export const maxImageSizeBytes = 5 * 1024 * 1024;
export const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

function getCloudinaryConfig() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
  };
}

export function createImageUploadService({
  signRequest = (params, secret) => cloudinary.utils.api_sign_request(params, secret),
  getConfig = getCloudinaryConfig,
  createId = randomUUID,
  now = Date.now,
} = {}) {
  return async function createImageUpload({ kind, contentType }) {
    if (!['cars', 'submissions'].includes(kind) || !allowedImageTypes.includes(contentType)) {
      throw new TypeError('Unsupported image upload scope or content type');
    }

    const { cloudName, apiKey, apiSecret, uploadPreset } = getConfig();
    if (!cloudName || !/^[A-Za-z0-9_-]+$/.test(cloudName)
      || !apiKey || !apiSecret || !uploadPreset) {
      throw new Error('Cloudinary image upload is not configured');
    }

    const params = {
      timestamp: Math.floor(now() / 1000),
      public_id: createId(),
      asset_folder: `carhub/${kind}`,
      upload_preset: uploadPreset,
      overwrite: false,
      allowed_formats: 'jpg,png,webp',
    };
    const signature = signRequest(params, apiSecret);
    if (typeof signature !== 'string' || !signature) {
      throw new Error('Cloudinary did not return an upload signature');
    }

    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      uploadFields: {
        ...params,
        api_key: apiKey,
        signature,
      },
    };
  };
}

export const createImageUpload = createImageUploadService();
