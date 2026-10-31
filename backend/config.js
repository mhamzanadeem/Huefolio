export class ConfigurationError extends Error {
  constructor(variable, rule) {
    super(`${variable}: ${rule}`); this.name = 'ConfigurationError'; this.variable = variable;
  }
}
const integer = (name, value, fallback, min, max) => {
  const n = value === undefined ? fallback : Number(value);
  if ((value !== undefined && String(value).trim() === '') || !Number.isInteger(n) || n < min || n > max) throw new ConfigurationError(name, `must be a whole number between ${min} and ${max}.`);
  return n;
};
export function loadConfig(env = process.env) {
  if (env.YOUCAM_INTEGRATION_ENABLED !== undefined && !['true', 'false'].includes(env.YOUCAM_INTEGRATION_ENABLED)) throw new ConfigurationError('YOUCAM_INTEGRATION_ENABLED', 'must be true or false, without surrounding quotes.');
  const enabled = env.YOUCAM_INTEGRATION_ENABLED === 'true';
  const origins = (env.FRONTEND_ORIGINS || 'http://localhost:4173,http://127.0.0.1:4173').split(',').filter(Boolean).map(s => {
    if (s.trim() === '*') return '*';
    let u;
    try { u = new URL(s.trim()); } catch { throw new ConfigurationError('FRONTEND_ORIGINS', 'must be * or complete frontend URLs, such as https://your-project.vercel.app.'); }
    if (u.origin !== s.trim() || u.hostname.includes('*') || u.username || u.password || (u.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(u.hostname)))) throw new ConfigurationError('FRONTEND_ORIGINS', 'must be * or exact HTTPS frontend origins in production, with no trailing slash, path or partial wildcard.');
    return u.origin;
  });
  const uploadHosts = (env.YOUCAM_UPLOAD_HOSTS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (uploadHosts.some(h => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(h) || !h.includes('.') || h.includes('..'))) throw new ConfigurationError('YOUCAM_UPLOAD_HOSTS', 'must contain the verified upload hostnames only, without https://, paths, quotes or wildcards.');
  if (env.YOUCAM_API_BASE_URL && env.YOUCAM_API_BASE_URL !== 'https://yce-api-01.makeupar.com') throw new ConfigurationError('YOUCAM_API_BASE_URL', 'must be the official YouCam API origin, or leave this optional variable unset.');
  if (enabled && !env.YOUCAM_API_KEY?.trim()) throw new ConfigurationError('YOUCAM_API_KEY', 'is required when analysis is enabled.');
  if (enabled && !uploadHosts.length) throw new ConfigurationError('YOUCAM_UPLOAD_HOSTS', 'is required; copy the verified hostname list from your working backend/.env.');
  if (enabled && !origins.length) throw new ConfigurationError('FRONTEND_ORIGINS', 'must include your deployed frontend origin.');
  if (enabled && (!env.HUEFOLIO_ADMIN_TOKEN || env.HUEFOLIO_ADMIN_TOKEN.trim().length < 32)) throw new ConfigurationError('HUEFOLIO_ADMIN_TOKEN', 'must contain at least 32 non-padding characters. Set the private admin token in Render Environment.');
  if (env.HUEFOLIO_RECONCILE_ON_START !== undefined && !['true', 'false'].includes(env.HUEFOLIO_RECONCILE_ON_START)) throw new ConfigurationError('HUEFOLIO_RECONCILE_ON_START', 'must be true or false, without surrounding quotes.');
  return {
    enabled, apiKey: env.YOUCAM_API_KEY?.trim() || '', origins, uploadHosts, adminToken: env.HUEFOLIO_ADMIN_TOKEN || '',
    port: integer('PORT', env.PORT, 10000, 1, 65535),
    budget: integer('HUEFOLIO_API_BUDGET_UNITS', env.HUEFOLIO_API_BUDGET_UNITS, 800, 0, 1000),
    requestLimit: integer('YOUCAM_REQUEST_LIMIT', env.YOUCAM_REQUEST_LIMIT, 200, 1, 250),
    // Startup automatically uses the configured per-process allocation. Operators
    // can explicitly opt into manual reconciliation instead.
    reconcile: env.HUEFOLIO_RECONCILE_ON_START === 'true',
    maxConcurrent: integer('HUEFOLIO_MAX_CONCURRENT_ANALYSES', env.HUEFOLIO_MAX_CONCURRENT_ANALYSES, 2, 1, 2),
    pollMs: 5000, interactiveMs: 120000, cleanupMs: 600000, resultTtlMs: 900000,
    maxJobs: 100, requestTimeoutMs: 30000, upstreamTimeoutMs: 20000,
    maxBytes: 9500000
  };
}
