function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function resolveSocketCorsOrigin(rawOrigin?: string): true | string | string[] {
  const trimmedOrigin = rawOrigin?.trim();

  if (!trimmedOrigin) {
    return 'http://localhost:3000';
  }

  if (trimmedOrigin === '*') {
    return true;
  }

  const origins = trimmedOrigin
    .split(',')
    .map(origin => normalizeOrigin(origin))
    .filter(Boolean);

  if (origins.length === 0) {
    return 'http://localhost:3000';
  }

  const uniqueOrigins = Array.from(new Set(origins));
  return uniqueOrigins.length === 1 ? uniqueOrigins[0] : uniqueOrigins;
}
