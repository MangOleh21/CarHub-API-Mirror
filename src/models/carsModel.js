const carColumns = `
  id::text AS id,
  brand,
  model,
  year,
  transmission,
  fuel_type AS "fuelType",
  mileage,
  price::text AS price,
  image_url AS "imageUrl",
  seller_name AS "sellerName",
  seller_phone AS "sellerPhone",
  location,
  description,
  created_at AS "createdAt"
`;

export function createCarsModel(pool) {
  return {
    async list({ search, brand, limit, offset }) {
      const filters = [];
      const values = [];

      if (search) {
        values.push(`%${search}%`);
        filters.push(`(brand ILIKE $${values.length} OR model ILIKE $${values.length})`);
      }

      if (brand) {
        values.push(brand);
        filters.push(`brand ILIKE $${values.length}`);
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const countResult = await pool.query(
        `SELECT COUNT(*)::text AS count FROM cars ${whereClause}`,
        values,
      );
      const totalItems = Number(countResult.rows[0].count);
      const pageValues = [...values, limit, offset];
      const result = await pool.query(
        `SELECT ${carColumns}
         FROM cars
         ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues,
      );

      return { items: result.rows, totalItems };
    },

    async getById(id) {
      const result = await pool.query(
        `SELECT ${carColumns} FROM cars WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },
  };
}
