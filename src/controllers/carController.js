import { z } from 'zod';
import {
  BODY_TYPE_OPTIONS,
  COLOR_OPTIONS,
  FUEL_TYPE_OPTIONS,
  TRANSMISSION_OPTIONS,
} from '../constants/car-options.js';

const optionalFilter = z.string().trim().max(100).optional()
  .transform((value) => value || undefined);

function parseBodyTypeQuery(value) {
  if (value === undefined) return undefined;
  const rawItems = Array.isArray(value) ? value : [value];
  const flattened = rawItems
    .flatMap((entry) => (typeof entry === 'string' ? entry.split(',') : [entry]))
    .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
    .filter((entry) => entry !== '');
  if (flattened.length === 0) return undefined;
  return [...new Set(flattened)];
}

const listQueryFields = {
  search: optionalFilter,
  brand: optionalFilter,
  transmission: z.enum(TRANSMISSION_OPTIONS).optional(),
  fuelType: z.enum(FUEL_TYPE_OPTIONS).optional(),
  color: z.enum(COLOR_OPTIONS).optional(),
  bodyType: z.preprocess(
    parseBodyTypeQuery,
    z.array(z.enum(BODY_TYPE_OPTIONS)).min(1).max(BODY_TYPE_OPTIONS.length).optional(),
  ),
  minPrice: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  maxPrice: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  minYear: z.coerce.number().int().min(1886).max(2100).optional(),
  maxYear: z.coerce.number().int().min(1886).max(2100).optional(),
  sortBy: z.enum(['createdAt', 'price', 'year']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

function createListQuerySchema(allowArchiveStatus) {
  return z.object({
    ...listQueryFields,
    ...(allowArchiveStatus
      ? { archiveStatus: z.enum(['active', 'archived']).default('active') }
      : {}),
  }).strict().refine(
    ({ minPrice, maxPrice }) => minPrice === undefined || maxPrice === undefined || minPrice <= maxPrice,
    { path: ['maxPrice'], message: 'Maximum price must not be less than minimum price' },
  ).refine(
    ({ minYear, maxYear }) => minYear === undefined || maxYear === undefined || minYear <= maxYear,
    { path: ['maxYear'], message: 'Maximum year must not be less than minimum year' },
  );
}

const listQuerySchema = createListQuerySchema(false);
const adminListQuerySchema = createListQuerySchema(true);

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

export function createCarController(carModel, { allowArchived = false } = {}) {
  return {
    listBrands: async (_request, response) => {
      const brands = await carModel.listBrands();
      return response.status(200).json({ success: true, data: brands });
    },

    list: async (request, response) => {
      const parsedQuery = (allowArchived ? adminListQuerySchema : listQuerySchema)
        .safeParse(request.query);
      if (!parsedQuery.success) {
        return validationError(response, parsedQuery.error, 'Invalid car query');
      }

      const { page, pageSize, archiveStatus, ...filters } = parsedQuery.data;
      const result = await carModel.list({
        ...filters,
        ...(allowArchived ? { archiveStatus } : {}),
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

      const car = await carModel.getById(parsedId.data, { includeArchived: allowArchived });
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
