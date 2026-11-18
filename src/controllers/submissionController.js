import { z } from 'zod';
import { verifyVercelBlobImage } from '../services/verify-image.js';

const currentYear = new Date().getFullYear();
const submissionSchema = z.object({
  sellerName: z.string().trim().min(1).max(150),
  sellerPhone: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{7,19}$/),
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  year: z.number().int().min(1886).max(currentYear + 1),
  transmission: z.enum(['Manual', 'Automatic']),
  mileage: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  expectedPrice: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  location: z.string().trim().min(1).max(150),
  imageUrl: z.string().url().refine((value) => new URL(value).protocol === 'https:'),
  description: z.string().trim().max(3_000).optional(),
}).strict();

export function createSubmissionController(submissionModel) {
  return async (request, response) => {
    const parsedBody = submissionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return response.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid submission',
          details: parsedBody.error.flatten().fieldErrors,
        },
      });
    }
    if (!await verifyVercelBlobImage(parsedBody.data.imageUrl)) {
      return response.status(422).json({
        error: {
          code: 'INVALID_IMAGE',
          message: 'Uploaded image must be a valid JPEG, PNG, or WebP file.',
        },
      });
    }

    const submission = await submissionModel.create(parsedBody.data);
    return response.status(201).json({ success: true, data: submission });
  };
}
