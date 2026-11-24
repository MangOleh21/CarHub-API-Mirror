import { z } from 'zod';

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const submissionIdSchema = z.string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n);

const reviewNoteSchema = z.string().trim().min(1).max(3_000).optional();
const imageUrlSchema = z.string().url()
  .refine((value) => new URL(value).protocol === 'https:');

const approvalSchema = z.object({
  location: z.string().trim().min(1).max(150).optional(),
  imageUrl: imageUrlSchema.optional(),
  images: z.array(imageUrlSchema).min(1).max(10).optional(),
  reviewNote: reviewNoteSchema,
}).strict().refine(
  ({ imageUrl, images }) => !imageUrl || !images || imageUrl === images[0],
  { path: ['imageUrl'], message: 'imageUrl must match the first image' },
);

const rejectionSchema = z.object({
  reviewNote: reviewNoteSchema,
}).strict();

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
  const moderate = async (request, response, status) => {
    const parsedId = submissionIdSchema.safeParse(request.params.id);
    if (!parsedId.success) {
      return validationError(response, 'Invalid submission id');
    }

    const schema = status === 'approved' ? approvalSchema : rejectionSchema;
    const parsedBody = schema.safeParse(request.body);
    if (!parsedBody.success) {
      return validationError(
        response,
        'Invalid submission review data',
        parsedBody.error.flatten().fieldErrors,
      );
    }

    const result = await submissionModel.moderate(parsedId.data, {
      ...parsedBody.data,
      status,
      reviewedByEmail: request.admin.email,
      reviewNote: parsedBody.data.reviewNote ?? null,
    });

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
  };

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

    approve: (request, response) => moderate(request, response, 'approved'),
    reject: (request, response) => moderate(request, response, 'rejected'),
  };
}
