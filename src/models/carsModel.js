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
  CASE
    WHEN cardinality(images) > 0 THEN images
    ELSE ARRAY[image_url]
  END AS images,
  seller_name AS "sellerName",
  seller_phone AS "sellerPhone",
  location,
  description,
  created_at AS "createdAt"
`;

export function createCarsModel(pool) {
  return {
    async listBrands() {
      const result = await pool.query(
        `SELECT brand
         FROM (SELECT DISTINCT brand FROM cars) AS catalog_brands
         ORDER BY LOWER(brand), brand`,
      );
      return result.rows.map(({ brand }) => brand);
    },

    async list({
      search,
      brand,
      transmission,
      minPrice,
      maxPrice,
      minYear,
      maxYear,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit,
      offset,
    }) {
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

      for (const [column, operator, value] of [
        ['transmission', '=', transmission],
        ['price', '>=', minPrice],
        ['price', '<=', maxPrice],
        ['year', '>=', minYear],
        ['year', '<=', maxYear],
      ]) {
        if (value !== undefined) {
          values.push(value);
          filters.push(`${column} ${operator} $${values.length}`);
        }
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const countResult = await pool.query(
        `SELECT COUNT(*)::text AS count FROM cars ${whereClause}`,
        values,
      );
      const totalItems = Number(countResult.rows[0].count);
      const pageValues = [...values, limit, offset];
      const sortColumns = {
        createdAt: 'created_at',
        price: 'price',
        year: 'year',
      };
      const sortColumn = sortColumns[sortBy];
      const direction = sortOrder.toUpperCase();
      const result = await pool.query(
        `SELECT ${carColumns}
         FROM cars
         ${whereClause}
         ORDER BY ${sortColumn} ${direction}, id ${direction}
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

    async create(input) {
      const result = await pool.query(
        `INSERT INTO cars (
           brand,
           model,
           year,
           transmission,
           fuel_type,
           mileage,
           price,
           image_url,
           images,
           seller_name,
           seller_phone,
           location,
           description
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING ${carColumns}`,
        [
          input.brand,
          input.model,
          input.year,
          input.transmission,
          input.fuelType,
          input.mileage,
          input.price,
          input.imageUrl,
          input.images,
          input.sellerName,
          input.sellerPhone,
          input.location,
          input.description,
        ],
      );
      return result.rows[0];
    },

    async update(id, input) {
      const result = await pool.query(
        `UPDATE cars
         SET brand = $1,
             model = $2,
             year = $3,
             transmission = $4,
             fuel_type = $5,
             mileage = $6,
             price = $7,
             image_url = $8,
             images = $9,
             seller_name = $10,
             seller_phone = $11,
             location = $12,
             description = $13
         WHERE id = $14
         RETURNING ${carColumns}`,
        [
          input.brand,
          input.model,
          input.year,
          input.transmission,
          input.fuelType,
          input.mileage,
          input.price,
          input.imageUrl,
          input.images,
          input.sellerName,
          input.sellerPhone,
          input.location,
          input.description,
          id,
        ],
      );
      return result.rows[0] ?? null;
    },

    async deleteById(id) {
      const result = await pool.query(
        'DELETE FROM cars WHERE id = $1 RETURNING id::text AS id',
        [id],
      );
      return result.rows[0] ?? null;
    },
  };
}
