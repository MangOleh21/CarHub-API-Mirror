function defaultNameFromEmail(email) {
  return email.split('@')[0]?.trim() || 'Administrator';
}

export function createAdminsModel(pool) {
  return {
    async findUserByEmail(email) {
      const result = await pool.query(
        `SELECT id::text AS id, name, email, password_hash AS "passwordHash",
                role, is_active AS "isActive"
         FROM users
         WHERE LOWER(email) = LOWER($1) AND role IN ('owner', 'admin')
         LIMIT 1`,
        [email],
      );
      return result.rows[0] ?? null;
    },

    async createInitialOwner({ name, email, passwordHash }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', ['484992813177']);
        const existingOwner = await client.query(
          "SELECT 1 FROM users WHERE role = 'owner' LIMIT 1",
        );
        if (existingOwner.rowCount > 0) {
          await client.query('ROLLBACK');
          return null;
        }

        const ownerName = name?.trim() || defaultNameFromEmail(email);
        const result = await client.query(
          `INSERT INTO users (name, email, phone, password_hash, role)
           VALUES ($1, $2, '', $3, 'owner')
           RETURNING id::text AS id, name, email, role`,
          [ownerName, email, passwordHash],
        );
        await client.query('COMMIT');
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async createAdmin({ name, email, phone = '', location = null, isActive = true, passwordHash }) {
      const adminName = name?.trim() || defaultNameFromEmail(email);
      const result = await pool.query(
        `INSERT INTO users (name, email, phone, location, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'admin', $6)
         ON CONFLICT DO NOTHING
         RETURNING id::text AS id, name, email, phone, location, role,
                   is_active AS "isActive", created_at AS "createdAt"`,
        [adminName, email, phone, location, passwordHash, isActive],
      );
      return result.rows[0] ?? null;
    },

    async updateAdmin(id, { name, email, phone = '', location = null, isActive, passwordHash }) {
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
             WHERE id = $7 AND role = 'admin'
             RETURNING id::text AS id, name, email, phone, location, role,
                       is_active AS "isActive", created_at AS "createdAt"`,
            [name, email, phone, location, isActive, passwordHash, id],
          )
          : await pool.query(
            `UPDATE users
             SET name = $1,
                 email = $2,
                 phone = $3,
                 location = $4,
                 is_active = $5
             WHERE id = $6 AND role = 'admin'
             RETURNING id::text AS id, name, email, phone, location, role,
                       is_active AS "isActive", created_at AS "createdAt"`,
            [name, email, phone, location, isActive, id],
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

        return { kind: 'updated', admin: updated };
      } catch (error) {
        if (error?.code === '23505') {
          return { kind: 'email_exists' };
        }
        throw error;
      }
    },

    async deleteAdmin(id) {
      const result = await pool.query(
        `DELETE FROM users
         WHERE id = $1 AND role = 'admin'
         RETURNING id::text AS id`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async listAdmins() {
      const result = await pool.query(
        `SELECT id::text AS id, name, email, phone, location, role,
                is_active AS "isActive", created_at AS "createdAt"
         FROM users
         WHERE role IN ('owner', 'admin')
         ORDER BY created_at DESC, id DESC`,
      );
      return result.rows;
    },

    async deactivateAdmin(id) {
      const result = await pool.query(
        `WITH disabled_admin AS (
           UPDATE users
           SET is_active = FALSE
           WHERE id = $1 AND role = 'admin' AND is_active = TRUE
           RETURNING id, name, email, role, is_active
         ), revoked_sessions AS (
           UPDATE user_sessions
           SET revoked_at = NOW()
           WHERE user_id = (SELECT id FROM disabled_admin)
             AND revoked_at IS NULL
           RETURNING id
         )
         SELECT disabled_admin.id::text AS id, disabled_admin.name,
                disabled_admin.email, disabled_admin.role,
                disabled_admin.is_active AS "isActive"
         FROM disabled_admin`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async createSession({ adminUserId, userId, tokenHash, expiresAt }) {
      await pool.query(
        `INSERT INTO user_sessions (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId ?? adminUserId, tokenHash, expiresAt],
      );
    },

    async getActiveSession(tokenHash) {
      const result = await pool.query(
        `SELECT users.id::text AS id, users.name, users.email, users.role
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
  };
}
