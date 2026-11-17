export function parseAllowedOrigins(value = process.env.FRONTEND_ORIGINS) {
  const origins = (value ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('FRONTEND_ORIGINS must contain valid origins');
    }

    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('FRONTEND_ORIGINS must contain origins without paths');
    }
  }

  return [...new Set(origins)];
}
