import 'dotenv/config';
import { createApp } from './app.js';
import { createPool } from './database/pool.js';
import { createCarRepository } from './repositories/cars.js';
import { createAdminRepository } from './repositories/admins.js';
import { createSubmissionRepository } from './repositories/submissions.js';
import { parseAllowedOrigins } from './config/origins.js';

const port = Number(process.env.PORT ?? 5000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const pool = createPool();
const server = createApp({
  carRepository: createCarRepository(pool),
  submissionRepository: createSubmissionRepository(pool),
  adminRepository: createAdminRepository(pool),
  allowedOrigins: parseAllowedOrigins(),
}).listen(port, () => {
  console.log(`CarHub API listening on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        console.error('Failed to close the HTTP server cleanly');
        process.exitCode = 1;
      }
      pool.end().catch(() => {
        console.error('Failed to close the database pool cleanly');
        process.exitCode = 1;
      });
    });
  });
}
