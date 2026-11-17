export function createAdminRepository(pool) {
  return {
    async findUserByEmail(email) {
      const result = await pool.query(
        `SELECT id::text AS id, email, password_hash AS "passwordHash",
                role, is_active AS "isActive"
         FROM admin_users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [email],
      );
      return result.rows[0] ?? null;
    },

    async createInitialOwner({ email, passwordHash }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock($1)', ['484992813177']);
        const existingOwner = await client.query(
          "SELECT 1 FROM admin_users WHERE role = 'owner' LIMIT 1",
        );
        if (existingOwner.rowCount > 0) {
          await client.query('ROLLBACK');
          return null;
        }

        const result = await client.query(
          `INSERT INTO admin_users (email, password_hash, role)
           VALUES ($1, $2, 'owner')
           RETURNING id::text AS id, email, role`,
          [email, passwordHash],
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

    async createAdmin({ email, passwordHash }) {
      const result = await pool.query(
        `INSERT INTO admin_users (email, password_hash, role)
         VALUES ($1, $2, 'admin')
         ON CONFLICT (email) DO NOTHING
         RETURNING id::text AS id, email, role, is_active AS "isActive"`,
        [email, passwordHash],
      );
      return result.rows[0] ?? null;
    },

    async deactivateAdmin(id) {
      const result = await pool.query(
        `WITH disabled_admin AS (
           UPDATE admin_users
           SET is_active = FALSE
           WHERE id = $1 AND role = 'admin' AND is_active = TRUE
           RETURNING id, email, role, is_active
         ), revoked_sessions AS (
           UPDATE admin_sessions
           SET revoked_at = NOW()
           WHERE admin_user_id = (SELECT id FROM disabled_admin)
             AND revoked_at IS NULL
           RETURNING id
         )
         SELECT disabled_admin.id::text AS id, disabled_admin.email,
                disabled_admin.role, disabled_admin.is_active AS "isActive"
         FROM disabled_admin`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async createSession({ adminUserId, tokenHash, expiresAt }) {
      await pool.query(
        `INSERT INTO admin_sessions (admin_user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [adminUserId, tokenHash, expiresAt],
      );
    },

    async getActiveSession(tokenHash) {
      const result = await pool.query(
        `SELECT admin_users.id::text AS id, admin_users.email, admin_users.role
         FROM admin_sessions
         JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id
         WHERE admin_sessions.token_hash = $1
           AND admin_sessions.revoked_at IS NULL
           AND admin_sessions.expires_at > NOW()
           AND admin_users.is_active = TRUE`,
        [tokenHash],
      );
      return result.rows[0] ?? null;
    },

    async revokeSession(tokenHash) {
      await pool.query(
        `UPDATE admin_sessions
         SET revoked_at = NOW()
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash],
      );
    },
  };
}
