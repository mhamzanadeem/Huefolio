const integer = (value, fallback, min, max) => {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error('Invalid numeric backend configuration.');
  return n;
};
export function loadConfig(env = process.env) {
  const enabled = env.YOUCAM_INTEGRATION_ENABLED === 'true';
  const origins = (env.FRONTEND_ORIGINS || 'http://localhost:4173,http://127.0.0.1:4173').split(',').filter(Boolean).map(s => {
    const u = new URL(s.trim());
    if (u.origin !== s.trim() || u.username || u.password || (u.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new Error('FRONTEND_ORIGINS must contain exact HTTPS origins.');
    return u.origin;
  });
  const uploadHosts = (env.YOUCAM_UPLOAD_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (uploadHosts.some(h => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(h) || !h.includes('.') || h.includes('..'))) throw new Error('Upload hosts must be exact DNS hostnames, without wildcards.');
  if (env.YOUCAM_API_BASE_URL && env.YOUCAM_API_BASE_URL !== 'https://yce-api-01.makeupar.com') throw new Error('Only the official YouCam API host is supported.');
  if (enabled && (!env.YOUCAM_API_KEY?.trim() || !uploadHosts.length || !origins.length)) throw new Error('Enabled analysis requires a server API key, frontend origins, and exact upload hosts.');
  if (enabled && (!env.HUEFOLIO_ADMIN_TOKEN || env.HUEFOLIO_ADMIN_TOKEN.length < 32)) throw new Error('A strong server administration token is required.');
  if (env.HUEFOLIO_RECONCILE_ON_START !== undefined && !['true', 'false'].includes(env.HUEFOLIO_RECONCILE_ON_START)) throw new Error('HUEFOLIO_RECONCILE_ON_START must be true or false.');
  return {
    enabled, apiKey: env.YOUCAM_API_KEY?.trim() || '', origins, uploadHosts, adminToken: env.HUEFOLIO_ADMIN_TOKEN || '',
    port: integer(env.PORT, 10000, 1, 65535),
    budget: integer(env.HUEFOLIO_API_BUDGET_UNITS, 800, 0, 1000),
    requestLimit: integer(env.YOUCAM_REQUEST_LIMIT, 200, 1, 250),
    // Startup automatically uses the configured per-process allocation. Operators
    // can explicitly opt into manual reconciliation instead.
    reconcile: env.HUEFOLIO_RECONCILE_ON_START === 'true',
    maxConcurrent: integer(env.HUEFOLIO_MAX_CONCURRENT_ANALYSES, 2, 1, 2),
    pollMs: 5000, interactiveMs: 120000, cleanupMs: 600000, resultTtlMs: 900000,
    maxJobs: 100, requestTimeoutMs: 30000, upstreamTimeoutMs: 20000,
    maxBytes: 9500000
  };
}
