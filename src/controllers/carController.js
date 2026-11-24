import { z } from 'zod';

const optionalFilter = z.string().trim().max(100).optional()
  .transform((value) => value || undefined);

const listQuerySchema = z.object({
  search: optionalFilter,
  brand: optionalFilter,
  transmission: z.enum(['Manual', 'Automatic']).optional(),
  minPrice: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  maxPrice: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  minYear: z.coerce.number().int().min(1886).max(2100).optional(),
  maxYear: z.coerce.number().int().min(1886).max(2100).optional(),
  sortBy: z.enum(['createdAt', 'price', 'year']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict().refine(
  ({ minPrice, maxPrice }) => minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
  { path: ['maxPrice'], message: 'Maximum price must not be less than minimum price' },
).refine(
  ({ minYear, maxYear }) => minYear === undefined || maxYear === undefined || minYear <= maxYear,
  { path: ['maxYear'], message: 'Maximum year must not be less than minimum year' },
);

const maxBigintId = 9_223_372_036_854_775_807n;
const carIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= maxBigintId);

function validationError(response, error, message) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
      details: error.flatten().fieldErrors,
    },
  });
}

export function createCarController(carModel) {
  return {
    list: async (request, response) => {
      const parsedQuery = listQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return validationError(response, parsedQuery.error, 'Invalid car query');
      }

      const { page, pageSize, ...filters } = parsedQuery.data;
      const result = await carModel.list({
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
    },

    getById: async (request, response) => {
      const parsedId = carIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return validationError(response, parsedId.error, 'Invalid car id');
      }

      const car = await carModel.getById(parsedId.data);
      if (!car) {
        return response.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Car not found',
          },
        });
      }

      return response.status(200).json({ success: true, data: car });
    },
  };
}
