const submissionColumns = `
  id::text AS id,
  seller_name AS "sellerName",
  seller_phone AS "sellerPhone",
  brand,
  model,
  year,
  transmission,
  mileage,
  expected_price::text AS "expectedPrice",
  image_url AS "imageUrl",
  location,
  description,
  status,
  reviewed_by_email AS "reviewedByEmail",
  review_note AS "reviewNote",
  created_at AS "createdAt"
`;

async function updateReview(client, id, input) {
  const result = await client.query(
    `UPDATE submissions
     SET status = $1, reviewed_by_email = $2, review_note = $3
     WHERE id = $4
     RETURNING id::text AS id, status,
               reviewed_by_email AS "reviewedByEmail",
               review_note AS "reviewNote"`,
    [input.status, input.reviewedByEmail, input.reviewNote ?? null, id],
  );
  return result.rows[0];
}

export function createSubmissionsModel(pool) {
  return {
    async create(input) {
      const result = await pool.query(
        `INSERT INTO submissions (
           seller_name,
           seller_phone,
           brand,
           model,
           year,
           transmission,
           mileage,
           expected_price,
           location,
           image_url,
           description
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id::text AS id, status, created_at AS "createdAt"`,
        [
          input.sellerName,
          input.sellerPhone,
          input.brand,
          input.model,
          input.year,
          input.transmission,
          input.mileage,
          input.expectedPrice,
          input.location,
          input.imageUrl,
          input.description ?? null,
        ],
      );

      return result.rows[0];
    },

    async list({ status, limit, offset }) {
      const filters = status === 'all' ? [] : [status];
      const whereClause = filters.length > 0 ? 'WHERE status = $1' : '';
      const countResult = await pool.query(
        `SELECT COUNT(*)::text AS count FROM submissions ${whereClause}`,
        filters,
      );
      const pageValues = [...filters, limit, offset];
      const limitParameter = filters.length + 1;
      const offsetParameter = filters.length + 2;
      const result = await pool.query(
        `SELECT ${submissionColumns}
         FROM submissions
         ${whereClause}
         ORDER BY created_at DESC, id DESC
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
        const imageUrl = submission.imageUrl?.trim() || input.imageUrl;
        const missingFields = [];
        if (!location) missingFields.push('location');
        if (!imageUrl) missingFields.push('imageUrl');

        if (missingFields.length > 0) {
          await client.query('ROLLBACK');
          return { kind: 'missing_fields', fields: missingFields };
        }

        const carResult = await client.query(
          `INSERT INTO cars (
             brand,
             model,
             year,
             transmission,
             mileage,
             price,
             image_url,
             seller_name,
             seller_phone,
             location,
             description
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id::text AS id`,
          [
            submission.brand,
            submission.model,
            submission.year,
            submission.transmission,
            submission.mileage,
            submission.expectedPrice,
            imageUrl,
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
