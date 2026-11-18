import { z } from 'zod';
import { allowedImageTypes, maxImageSizeBytes } from '../services/image-upload.js';

const imageUploadSchema = z.object({
  contentType: z.enum(allowedImageTypes),
  size: z.number().int().min(1).max(maxImageSizeBytes),
}).strict();

function validationError(response, error) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Invalid image upload data',
      details: error.flatten().fieldErrors,
    },
  });
}

export function createImageUploadController(imageUploadService, kind) {
  return async (request, response) => {
    const parsed = imageUploadSchema.safeParse(request.body);
    if (!parsed.success) return validationError(response, parsed.error);

    const upload = await imageUploadService({ kind, contentType: parsed.data.contentType });
    return response.status(200).json({ success: true, data: upload });
  };
}
