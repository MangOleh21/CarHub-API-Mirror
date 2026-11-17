import { z } from 'zod';

const optionalFilter = z.string().trim().max(100).optional()
  .transform((value) => value || undefined);

const listQuerySchema = z.object({
  search: optionalFilter,
  brand: optionalFilter,
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const maxBigintId = 9_223_372_036_854_775_807n;
const carIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= maxBigintId);

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
  imageUrl: z.string().url().refine((value) => new URL(value).protocol === 'https:').optional(),
  description: z.string().trim().max(3_000).optional(),
}).strict();

function validationError(response, error, message) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: error.flatten().fieldErrors,
    },
  });
}

export function registerPublicRoutes(app, { carRepository, submissionRepository }) {
  app.get('/api/cars', async (request, response) => {
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return validationError(response, parsedQuery.error, 'Invalid car query');
    }

    const { page, pageSize, ...filters } = parsedQuery.data;
    const result = await carRepository.list({
      ...filters,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    return response.status(200).json({
      success: true,
      data: result.items,
      pagination: {
        page,
        pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / pageSize),
      },
    });
  });

  app.get('/api/cars/:id', async (request, response) => {
    const parsedId = carIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      return validationError(response, parsedId.error, 'Invalid car id');
    }

    const car = await carRepository.getById(parsedId.data);
    if (!car) {
      return response.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Car not found',
        },
      });
    }

    return response.status(200).json({ success: true, data: car });
  });

  app.post('/api/submissions', async (request, response) => {
    const parsedBody = submissionSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return validationError(response, parsedBody.error, 'Invalid submission');
    }

    const submission = await submissionRepository.create(parsedBody.data);
    return response.status(201).json({ success: true, data: submission });
  });
}
