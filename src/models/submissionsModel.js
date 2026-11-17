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
           image_url,
           description
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
          input.imageUrl ?? null,
          input.description ?? null,
        ],
      );

      return result.rows[0];
    },
  };
}
