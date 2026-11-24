import { z } from 'zod';
import { verifyManagedImage } from '../services/verify-image.js';

const carInputSchema = z.object({
  brand: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(100),
  year: z.number().int().min(1886).max(2100),
  transmission: z.enum(['Manual', 'Automatic']),
  fuelType: z.string().trim().min(1).max(50).default('Bensin'),
  mileage: z.number().int().min(0).max(2_147_483_647),
  price: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  imageUrl: z.string().url()
    .refine((value) => new URL(value).protocol === 'https:')
    .optional(),
  images: z.array(z.string().url().refine((value) => new URL(value).protocol === 'https:'))
    .min(1).max(10).optional(),
  sellerName: z.string().trim().min(1).max(150),
  sellerPhone: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{7,19}$/),
  location: z.string().trim().min(1).max(150),
  description: z.string().trim().max(3_000).nullable().optional()
    .transform((value) => value ?? null),
}).strict().refine((data) => Boolean(data.imageUrl || (data.images && data.images.length > 0)), {
  message: 'Image URL or images array is required',
  path: ['imageUrl'],
});

const carIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);

function validationError(response, error, message) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: error.flatten().fieldErrors,
    },
  });
}

function notFound(response) {
  return response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Car not found',
    },
  });
}

export function createAdminCarsController(carModel) {
  return {
    create: async (request, response) => {
      const parsed = carInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid car data');
      }

      const images = Array.isArray(parsed.data.images) && parsed.data.images.length > 0
        ? parsed.data.images
        : (parsed.data.imageUrl ? [parsed.data.imageUrl] : []);
      const imageUrl = parsed.data.imageUrl || images[0];

      for (const img of images) {
        if (!await verifyManagedImage(img)) {
          return response.status(422).json({
            error: {
              code: 'INVALID_IMAGE',
              message: 'Uploaded image must be a valid JPEG, PNG, or WebP file.',
            },
          });
        }
      }

      const car = await carModel.create({
        ...parsed.data,
        imageUrl,
        images,
      });
      return response.status(201).json({ success: true, data: car });
    },

    update: async (request, response) => {
      const parsedId = carIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return validationError(response, parsedId.error, 'Invalid car id');
      }

      const parsed = carInputSchema.safeParse(request.body);
      if (!parsed.success) {
        return validationError(response, parsed.error, 'Invalid car data');
      }

      const images = Array.isArray(parsed.data.images) && parsed.data.images.length > 0
        ? parsed.data.images
        : (parsed.data.imageUrl ? [parsed.data.imageUrl] : []);
      const imageUrl = parsed.data.imageUrl || images[0];

      for (const img of images) {
        if (!await verifyManagedImage(img)) {
          return response.status(422).json({
            error: {
              code: 'INVALID_IMAGE',
              message: 'Uploaded image must be a valid JPEG, PNG, or WebP file.',
            },
          });
        }
      }

      const car = await carModel.update(parsedId.data, {
        ...parsed.data,
        imageUrl,
        images,
      });
      if (!car) {
        return notFound(response);
      }

      return response.status(200).json({ success: true, data: car });
    },

    delete: async (request, response) => {
      const parsedId = carIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return validationError(response, parsedId.error, 'Invalid car id');
      }

      const deletedCar = await carModel.deleteById(parsedId.data);
      if (!deletedCar) {
        return notFound(response);
      }

      return response.status(204).end();
    },
  };
}
