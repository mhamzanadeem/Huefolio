import { createHash, timingSafeEqual } from 'node:crypto';
import { AppError, safeError } from './errors.js';
import { JobManager } from './jobs.js';
import { YouCamProvider, WindowLimiter } from './provider.js';

export async function readBytes(req, limit, timeoutMs) {
  const chunks = []; let total = 0;
  const timer = setTimeout(() => req.destroy(), timeoutMs);
  try {
    for await (const chunk of req) { total += chunk.length; if (total >= limit) throw new AppError('IMAGE_SIZE', 413, 'Choose a photo smaller than 9.5 MB.'); chunks.push(chunk); }
    if (!total || req.aborted) throw new AppError('INVALID_BODY', 400, 'The image upload was interrupted.');
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); for (const chunk of chunks) chunk.fill(0); }
}
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const validToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const digest = token => createHash('sha256').update(token).digest();
export function createApp(config, options = {}) {
  const manager = options.manager || new JobManager(config, options.provider || new YouCamProvider(config));
  const ingress = new WindowLimiter(120, 60000);
  const submitLimits = new Map();
  const handler = async (req, res) => {
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body));
    };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    let admitted;
    try {
      const url = new URL(req.url, 'http://backend.invalid');
      if (url.pathname === '/healthz' && req.method === 'GET') { send(200, { status: 'ok' }); return; }
      if (url.pathname === '/internal/budget' && req.method === 'POST') {
        const provided = req.headers['x-admin-token'];
        if (origin || !config.adminToken || typeof provided !== 'string' || !timingSafeEqual(digest(provided), digest(config.adminToken))) throw new AppError('FORBIDDEN', 403);
        if (req.headers['content-type'] !== 'application/json' || url.search) throw new AppError('INVALID_PARAMETERS', 400);
        const bytes = await readBytes(req, 512, 5000);
        try { const body = JSON.parse(bytes.toString()); if (Object.keys(body).length !== 1) throw new Error(); manager.arm(body.remainingUnits); }
        catch (error) { if (error instanceof AppError) throw error; throw new AppError('INVALID_BUDGET', 400); }
        finally { bytes.fill(0); }
        send(200, { ready: true }); return;
      }
      if (!origin || !config.origins.includes(origin)) throw new AppError('ORIGIN_NOT_ALLOWED', 403, 'This website is not allowed to use the analysis service.');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id, X-Huefolio-Consent');
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      ingress.take();
      if (url.search) throw new AppError('INVALID_PARAMETERS', 400);
      if (url.pathname === '/v1/capabilities' && req.method === 'GET') { send(200, { enabled: config.enabled, ready: config.enabled && manager.armed, consentVersion: 'youcam-color-v1', maxBytes: config.maxBytes }); return; }
      const id = url.pathname.match(/^\/v1\/analyses\/([a-f0-9-]{36})$/i)?.[1];
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      if (!validToken(token)) throw new AppError('INVALID_TOKEN', 401, 'Your temporary analysis session is unavailable.');
      if (id && ['GET', 'DELETE'].includes(req.method)) {
        const job = manager.authorize(id, token);
        if (req.method === 'DELETE') manager.cancel(job);
        send(200, manager.view(job)); return;
      }
      if (url.pathname !== '/v1/analyses' || req.method !== 'POST') throw new AppError('NOT_FOUND', 404);
      if (!validId(req.headers['x-request-id']) || req.headers['x-huefolio-consent'] !== 'youcam-color-v1') throw new AppError('CONSENT_REQUIRED', 400, 'Choose a photo and explicitly agree to YouCam processing.');
      const mime = req.headers['content-type'];
      if (!['image/jpeg', 'image/png'].includes(mime)) throw new AppError('IMAGE_TYPE', 415, 'Choose a JPG or PNG photo.');
      const length = req.headers['content-length'];
      if (length !== undefined && (!/^\d+$/.test(length) || Number(length) <= 0 || Number(length) >= config.maxBytes)) throw new AppError('IMAGE_SIZE', 413, 'Choose a photo smaller than 9.5 MB.');
      // Do not trust arbitrary X-Forwarded-For. Shared proxy IPs share this conservative quota.
      const now = Date.now();
      for (const [key, entry] of submitLimits) if (entry.until <= now) submitLimits.delete(key);
      const ip = req.socket?.remoteAddress || 'unknown';
      const entry = submitLimits.get(ip) || { count: 0, until: now + 600000 };
      if (++entry.count > 6 || submitLimits.size > 1000) throw new AppError('REQUEST_RATE_LIMIT', 429, 'Please wait before starting another analysis.', 60);
      submitLimits.set(ip, entry);
      const admission = manager.admit(req.headers['x-request-id'], token);
      if (admission.duplicate) { req.resume(); send(200, manager.view(admission.job)); return; }
      admitted = admission.job;
      const bytes = await readBytes(req, config.maxBytes, config.requestTimeoutMs);
      // Worker owns the buffer from here; all paths wipe it and release references.
      void manager.process(admitted, bytes, mime);
      send(202, manager.view(admitted));
      admitted = null;
    } catch (error) {
      if (admitted) manager.rejectBody(admitted, error);
      const safe = safeError(error);
      if (safe.retryAfter) res.setHeader('Retry-After', String(safe.retryAfter));
      send(safe.status, { error: { code: safe.code, message: safe.message } });
    }
  };
  return { handler, manager, close: () => manager.close() };
}
