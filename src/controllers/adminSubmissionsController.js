import { z } from 'zod';

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const submissionIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);

const approvalSchema = z.object({
  status: z.literal('approved'),
  location: z.string().trim().min(1).max(150).optional(),
  imageUrl: z.string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:')
    .optional(),
}).strict();

const rejectionSchema = z.object({
  status: z.literal('rejected'),
}).strict();

const moderationSchema = z.discriminatedUnion('status', [
  approvalSchema,
  rejectionSchema,
]);

function validationError(response, message, details) {
  return response.status(422).json({
    error: {
      code: 'VALIDATION_ERROR',
      message,
      ...(details ? { details } : {}),
    },
  });
}

export function createAdminSubmissionsController(submissionModel) {
  return {
    list: async (request, response) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return validationError(
          response,
          'Invalid submission filters',
          parsed.error.flatten().fieldErrors,
        );
      }

      const { status, page, pageSize } = parsed.data;
      const result = await submissionModel.list({
        status,
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

    moderate: async (request, response) => {
      const parsedId = submissionIdSchema.safeParse(request.params.id);
      if (!parsedId.success) {
        return validationError(response, 'Invalid submission id');
      }

      const parsedBody = moderationSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return validationError(
          response,
          'Invalid submission status',
          parsedBody.error.flatten().fieldErrors,
        );
      }

      const result = await submissionModel.moderate(parsedId.data, parsedBody.data);
      if (result.kind === 'not_found') {
        return response.status(404).json({
          error: {
            code: 'SUBMISSION_NOT_FOUND',
            message: 'Submission not found',
          },
        });
      }

      if (result.kind === 'not_pending') {
        return response.status(409).json({
          error: {
            code: 'SUBMISSION_NOT_PENDING',
            message: 'Only pending submissions can be moderated',
            details: { status: result.status },
          },
        });
      }

      if (result.kind === 'missing_fields') {
        return response.status(422).json({
          error: {
            code: 'SUBMISSION_MISSING_REQUIRED_FIELDS',
            message: 'Location and image URL are required to approve this submission',
            details: { fields: result.fields },
          },
        });
      }

      return response.status(200).json({
        success: true,
        data: {
          submission: result.submission,
          car: result.car,
        },
      });
    },
  };
}
