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
  COALESCE(images, ARRAY[]::text[]) AS images,
  seller_name AS "sellerName",
  seller_phone AS "sellerPhone",
  location,
  description,
  created_at AS "createdAt"
`;

export function createCarsModel(pool) {
  return {
    async list({
      search,
      brand,
      transmission,
      fuelType,
      minPrice,
      maxPrice,
      minYear,
      maxYear,
      sort = 'newest',
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

      if (transmission) {
        values.push(transmission);
        filters.push(`transmission = $${values.length}`);
      }

      if (fuelType) {
        values.push(fuelType);
        filters.push(`fuel_type ILIKE $${values.length}`);
      }

      if (minPrice !== undefined && minPrice !== null) {
        values.push(minPrice);
        filters.push(`price >= $${values.length}`);
      }

      if (maxPrice !== undefined && maxPrice !== null) {
        values.push(maxPrice);
        filters.push(`price <= $${values.length}`);
      }

      if (minYear !== undefined && minYear !== null) {
        values.push(minYear);
        filters.push(`year >= $${values.length}`);
      }

      if (maxYear !== undefined && maxYear !== null) {
        values.push(maxYear);
        filters.push(`year <= $${values.length}`);
      }

      const sortOrders = {
        newest: 'created_at DESC, id DESC',
        price_asc: 'price ASC, id DESC',
        price_desc: 'price DESC, id DESC',
        year_desc: 'year DESC, id DESC',
        mileage_asc: 'mileage ASC, id DESC',
      };
      const orderBy = sortOrders[sort] ?? sortOrders.newest;

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
         ORDER BY ${orderBy}
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
      const hasImages = Array.isArray(input.images);
      const rawImages = hasImages && input.images.length > 0
        ? input.images
        : (input.imageUrl ? [input.imageUrl] : []);
      const primaryImageUrl = rawImages[0] ?? input.imageUrl;

      if (!hasImages) {
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
             seller_name,
             seller_phone,
             location,
             description
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING ${carColumns}`,
          [
            input.brand,
            input.model,
            input.year,
            input.transmission,
            input.fuelType,
            input.mileage,
            input.price,
            primaryImageUrl,
            input.sellerName,
            input.sellerPhone,
            input.location,
            input.description,
          ],
        );
        return result.rows[0];
      }

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
           seller_name,
           seller_phone,
           location,
           description,
           images
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
          primaryImageUrl,
          input.sellerName,
          input.sellerPhone,
          input.location,
          input.description,
          rawImages,
        ],
      );
      return result.rows[0];
    },

    async update(id, input) {
      const hasImages = Array.isArray(input.images);
      const rawImages = hasImages && input.images.length > 0
        ? input.images
        : (input.imageUrl ? [input.imageUrl] : []);
      const primaryImageUrl = rawImages[0] ?? input.imageUrl;

      if (!hasImages) {
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
               seller_name = $9,
               seller_phone = $10,
               location = $11,
               description = $12
           WHERE id = $13
           RETURNING ${carColumns}`,
          [
            input.brand,
            input.model,
            input.year,
            input.transmission,
            input.fuelType,
            input.mileage,
            input.price,
            primaryImageUrl,
            input.sellerName,
            input.sellerPhone,
            input.location,
            input.description,
            id,
          ],
        );
        return result.rows[0] ?? null;
      }

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
             seller_name = $9,
             seller_phone = $10,
             location = $11,
             description = $12,
             images = $13
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
          primaryImageUrl,
          input.sellerName,
          input.sellerPhone,
          input.location,
          input.description,
          rawImages,
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
