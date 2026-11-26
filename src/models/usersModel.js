const userPublicColumns = `
  id::text AS id,
  name,
  email,
  phone,
  location,
  is_active AS "isActive",
  created_at AS "createdAt"
`;

export function createUsersModel(pool) {
  return {
    async findByEmail(email) {
      const result = await pool.query(
        `SELECT ${userPublicColumns}, password_hash AS "passwordHash"
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email],
      );
      return result.rows[0] ?? null;
    },

    async findById(id) {
      const result = await pool.query(
        `SELECT ${userPublicColumns}
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async create({ name, email, phone, location = null, passwordHash, isActive = true }) {
      const result = await pool.query(
        `INSERT INTO users (name, email, phone, location, password_hash, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING
         RETURNING ${userPublicColumns}`,
        [name, email, phone, location, passwordHash, isActive],
      );
      return result.rows[0] ?? null;
    },

    async updateProfile(id, { name, phone, location, passwordHash }) {
      const result = passwordHash
        ? await pool.query(
          `UPDATE users
           SET name = $1,
               phone = $2,
               location = $3,
               password_hash = $4
           WHERE id = $5 AND is_active = TRUE
           RETURNING ${userPublicColumns}`,
          [name, phone, location ?? null, passwordHash, id],
        )
        : await pool.query(
          `UPDATE users
           SET name = $1,
               phone = $2,
               location = $3
           WHERE id = $4 AND is_active = TRUE
           RETURNING ${userPublicColumns}`,
          [name, phone, location ?? null, id],
        );
      return result.rows[0] ?? null;
    },

    async listUsers({ search, status = 'all', limit, offset }) {
      const filters = [];
      const values = [];

      if (search) {
        values.push(`%${search}%`);
        filters.push(
          `(name ILIKE $${values.length} OR email ILIKE $${values.length} OR phone ILIKE $${values.length} OR COALESCE(location, '') ILIKE $${values.length})`,
        );
      }

      if (status === 'active') {
        filters.push('is_active = TRUE');
      } else if (status === 'inactive') {
        filters.push('is_active = FALSE');
      }

      const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const countResult = await pool.query(
        `SELECT COUNT(*)::text AS count FROM users ${whereClause}`,
        values,
      );
      const totalItems = Number(countResult.rows[0].count);
      const pageValues = [...values, limit, offset];
      const result = await pool.query(
        `SELECT ${userPublicColumns}
         FROM users
         ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues,
      );

      return { items: result.rows, totalItems };
    },

    async updateByAdmin(id, { name, email, phone, location, isActive, passwordHash }) {
      try {
        const result = passwordHash
          ? await pool.query(
            `UPDATE users
             SET name = $1,
                 email = $2,
                 phone = $3,
                 location = $4,
                 is_active = $5,
                 password_hash = $6
             WHERE id = $7
             RETURNING ${userPublicColumns}`,
            [name, email, phone, location ?? null, isActive, passwordHash, id],
          )
          : await pool.query(
            `UPDATE users
             SET name = $1,
                 email = $2,
                 phone = $3,
                 location = $4,
                 is_active = $5
             WHERE id = $6
             RETURNING ${userPublicColumns}`,
            [name, email, phone, location ?? null, isActive, id],
          );

        const updated = result.rows[0] ?? null;
        if (!updated) {
          return { kind: 'not_found' };
        }

        if (!updated.isActive) {
          await pool.query(
            `UPDATE user_sessions
             SET revoked_at = NOW()
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [id],
          );
        }

        return { kind: 'updated', user: updated };
      } catch (error) {
        if (error?.code === '23505') {
          return { kind: 'email_exists' };
        }
        throw error;
      }
    },

    async deleteById(id) {
      const result = await pool.query(
        `DELETE FROM users
         WHERE id = $1
         RETURNING id::text AS id`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async createSession({ userId, tokenHash, expiresAt }) {
      await pool.query(
        `INSERT INTO user_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt],
      );
    },

    async getActiveSession(tokenHash) {
      const result = await pool.query(
        `SELECT users.id::text AS id,
                users.name,
                users.email,
                users.phone,
                users.location,
                users.created_at AS "createdAt"
         FROM user_sessions
         JOIN users ON users.id = user_sessions.user_id
         WHERE user_sessions.token_hash = $1
           AND user_sessions.revoked_at IS NULL
           AND user_sessions.expires_at > NOW()
           AND users.is_active = TRUE`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },

    async revokeSession(tokenHash) {
      await pool.query(
        `UPDATE user_sessions
         SET revoked_at = NOW()
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      );
    },

    async listListingsByUser({ userId, status = 'all', limit, offset }) {
      const carSelect = `
        SELECT 'car'::text AS kind,
               id::text AS id,
               id::text AS "carId",
               NULL::text AS "submissionId",
               'active'::text AS status,
               brand,
               model,
               year,
               transmission,
               fuel_type AS "fuelType",
               color,
               body_type AS "bodyType",
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
               NULL::text AS "reviewNote",
               NULL::timestamptz AS "reviewedAt",
               created_at AS "createdAt"
        FROM cars
        WHERE user_id = $1 AND archived_at IS NULL
      `;

      const submissionSelect = (statusFilter) => `
        SELECT 'submission'::text AS kind,
               id::text AS id,
               NULL::text AS "carId",
               id::text AS "submissionId",
               status,
               brand,
               model,
               year,
               transmission,
               fuel_type AS "fuelType",
               color,
               body_type AS "bodyType",
               mileage,
               expected_price::text AS price,
               image_url AS "imageUrl",
               CASE
                 WHEN cardinality(images) > 0 THEN images
                 WHEN image_url IS NOT NULL THEN ARRAY[image_url]
                 ELSE ARRAY[]::TEXT[]
               END AS images,
               seller_name AS "sellerName",
               seller_phone AS "sellerPhone",
               location,
               description,
               review_note AS "reviewNote",
               reviewed_at AS "reviewedAt",
               created_at AS "createdAt"
        FROM submissions
        WHERE user_id = $1 AND ${statusFilter}
      `;

      let sourceSql;
      let values;
      if (status === 'active') {
        sourceSql = carSelect;
        values = [userId];
      } else if (status === 'pending' || status === 'rejected') {
        sourceSql = submissionSelect('status = $2');
        values = [userId, status];
      } else {
        sourceSql = `${carSelect} UNION ALL ${submissionSelect("status IN ('pending', 'rejected')")}`;
        values = [userId];
      }

      const countResult = await pool.query(
        `SELECT COUNT(*)::text AS count FROM (${sourceSql}) AS user_listings`,
        values,
      );
      const totalItems = Number(countResult.rows[0].count);
      const pageValues = [...values, limit, offset];
      const result = await pool.query(
        `SELECT *
         FROM (${sourceSql}) AS user_listings
         ORDER BY "createdAt" DESC, id DESC
         LIMIT $${pageValues.length - 1} OFFSET $${pageValues.length}`,
        pageValues,
      );

      return { items: result.rows, totalItems };
    },
  };
}
