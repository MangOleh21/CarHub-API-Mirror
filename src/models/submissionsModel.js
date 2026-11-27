const submissionColumns = `
  id::text AS id,
  user_id::text AS "userId",
  seller_name AS "sellerName",
  seller_phone AS "sellerPhone",
  brand,
  model,
  year,
  transmission,
  fuel_type AS "fuelType",
  color,
  body_type AS "bodyType",
  mileage,
  expected_price::text AS "expectedPrice",
  image_url AS "imageUrl",
  CASE
    WHEN cardinality(images) > 0 THEN images
    WHEN image_url IS NOT NULL THEN ARRAY[image_url]
    ELSE ARRAY[]::TEXT[]
  END AS images,
  location,
  description,
  status,
  reviewed_by_email AS "reviewedByEmail",
  reviewed_by_name AS "reviewedByName",
  review_note AS "reviewNote",
  reviewed_at AS "reviewedAt",
  created_at AS "createdAt"
`;

const submissionListColumns = `
  submissions.id::text AS id,
  submissions.user_id::text AS "userId",
  submissions.seller_name AS "sellerName",
  submissions.seller_phone AS "sellerPhone",
  submissions.brand,
  submissions.model,
  submissions.year,
  submissions.transmission,
  submissions.fuel_type AS "fuelType",
  submissions.color,
  submissions.body_type AS "bodyType",
  submissions.mileage,
  submissions.expected_price::text AS "expectedPrice",
  submissions.image_url AS "imageUrl",
  CASE
    WHEN cardinality(submissions.images) > 0 THEN submissions.images
    WHEN submissions.image_url IS NOT NULL THEN ARRAY[submissions.image_url]
    ELSE ARRAY[]::TEXT[]
  END AS images,
  submissions.location,
  submissions.description,
  submissions.status,
  submissions.reviewed_by_email AS "reviewedByEmail",
  COALESCE(submissions.reviewed_by_name, reviewer.name) AS "reviewedByName",
  submissions.review_note AS "reviewNote",
  submissions.reviewed_at AS "reviewedAt",
  submissions.created_at AS "createdAt"
`;

async function updateReview(client, id, input) {
  const result = await client.query(
    `UPDATE submissions
     SET status = $1,
         reviewed_by_email = $2,
         reviewed_by_name = $3,
         review_note = $4,
         reviewed_at = NOW()
     WHERE id = $5
     RETURNING id::text AS id, status,
               reviewed_by_email AS "reviewedByEmail",
               reviewed_by_name AS "reviewedByName",
               review_note AS "reviewNote",
               reviewed_at AS "reviewedAt"`,
    [
      input.status,
      input.reviewedByEmail,
      input.reviewedByName ?? null,
      input.reviewNote ?? null,
      id,
    ],
  );
  return result.rows[0];
}

export function createSubmissionsModel(pool) {
  return {
    async create(input) {
      const result = await pool.query(
        `INSERT INTO submissions (
           user_id,
           seller_name,
           seller_phone,
           brand,
           model,
           year,
           transmission,
           fuel_type,
           color,
           body_type,
           mileage,
           expected_price,
           location,
           image_url,
           images,
           description
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id::text AS id, status, created_at AS "createdAt"`,
        [
          input.userId ?? null,
          input.sellerName,
          input.sellerPhone,
          input.brand,
          input.model,
          input.year,
          input.transmission,
          input.fuelType ?? 'Bensin',
          input.color ?? null,
          input.bodyType ?? null,
          input.mileage,
          input.expectedPrice,
          input.location,
          input.imageUrl,
          input.images?.length ? input.images : [input.imageUrl],
          input.description ?? null,
        ],
      );

      return result.rows[0];
    },

    async list({ status, limit, offset }) {
      const filters = status === 'all' ? [] : [status];
      const whereClause = filters.length > 0 ? 'WHERE submissions.status = $1' : '';
      const countResult = await pool.query(
        `SELECT COUNT(*)::text AS count FROM submissions ${whereClause}`,
        filters,
      );
      const pageValues = [...filters, limit, offset];
      const limitParameter = filters.length + 1;
      const offsetParameter = filters.length + 2;
      const result = await pool.query(
        `SELECT ${submissionListColumns}
         FROM submissions
         LEFT JOIN users AS reviewer
           ON LOWER(reviewer.email) = LOWER(submissions.reviewed_by_email)
         ${whereClause}
         ORDER BY submissions.created_at DESC, submissions.id DESC
         LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
        pageValues,
      );

      return {
        items: result.rows,
        totalItems: Number(countResult.rows[0].count),
      };
    },

    async moderate(id, input) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(
          `SELECT ${submissionColumns}
           FROM submissions
           WHERE id = $1
           FOR UPDATE`,
          [id],
        );
        const submission = result.rows[0];

        if (!submission) {
          await client.query('ROLLBACK');
          return { kind: 'not_found' };
        }

        if (submission.status !== 'pending') {
          await client.query('ROLLBACK');
          return { kind: 'not_pending', status: submission.status };
        }

        if (input.status === 'rejected') {
          const updated = await updateReview(client, id, input);
          await client.query('COMMIT');
          return { kind: 'updated', submission: updated, car: null };
        }

        const location = submission.location?.trim() || input.location;
        const savedImages = Array.isArray(submission.images)
          ? submission.images.filter((url) => typeof url === 'string' && url.length > 0)
          : [];
        const existingImages = savedImages.length > 0
          ? savedImages
          : (submission.imageUrl ? [submission.imageUrl] : []);
        const images = existingImages.length > 0
          ? existingImages
          : input.images?.length
            ? input.images
            : (input.imageUrl ? [input.imageUrl] : []);
        const missingFields = [];
        if (!location) missingFields.push('location');
        if (images.length === 0) missingFields.push('imageUrl');

        if (missingFields.length > 0) {
          await client.query('ROLLBACK');
          return { kind: 'missing_fields', fields: missingFields };
        }

        const color = submission.color || input.color || null;
        const bodyType = submission.bodyType || input.bodyType || null;
        const carResult = await client.query(
          `INSERT INTO cars (
             user_id,
             brand,
             model,
             year,
             transmission,
             fuel_type,
             color,
             body_type,
             mileage,
             price,
             image_url,
             images,
             seller_name,
             seller_phone,
             location,
             description
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           RETURNING id::text AS id`,
          [
            submission.userId ?? null,
            submission.brand,
            submission.model,
            submission.year,
            submission.transmission,
            submission.fuelType ?? 'Bensin',
            color,
            bodyType,
            submission.mileage,
            submission.expectedPrice,
            images[0],
            images,
            submission.sellerName,
            submission.sellerPhone,
            location,
            submission.description,
          ],
        );
        const updated = await updateReview(client, id, input);

        await client.query('COMMIT');
        return {
          kind: 'updated',
          submission: updated,
          car: carResult.rows[0],
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
