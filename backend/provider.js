import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppError } from './errors.js';

const API = 'https://yce-api-01.makeupar.com';
export class WindowLimiter {
  constructor(limit = 200, windowMs = 300000, now = Date.now) { this.limit = limit; this.windowMs = windowMs; this.now = now; this.times = []; }
  take() {
    const now = this.now(); this.times = this.times.filter(t => t > now - this.windowMs);
    if (this.times.length >= this.limit) throw new AppError('UPSTREAM_RATE_LIMIT', 429, 'Analysis is busy. Please wait before trying again.', Math.ceil((this.times[0] + this.windowMs - now) / 1000));
    this.times.push(now);
  }
}
// One shared gate covers file registration, task creation, status and deletion.
// The provider documents 250 / 300s per IP AND access token. Default to 200
// and pace at 4 requests/second, leaving headroom for other account activity.
export class ProviderRequestGate {
  constructor(limiter, { now = Date.now, wait = sleep, intervalMs = 250 } = {}) {
    this.limiter = limiter; this.now = now; this.wait = wait; this.intervalMs = intervalMs;
    this.nextAt = 0; this.blockedUntil = 0; this.queue = Promise.resolve();
  }
  cooldown(seconds) { this.blockedUntil = Math.max(this.blockedUntil, this.now() + seconds * 1000); }
  enter() {
    const admitted = this.queue.then(async () => {
      const checkCooldown = () => {
        if (this.blockedUntil > this.now()) throw new AppError('UPSTREAM_RATE_LIMIT', 429, 'Analysis is busy. Please wait before trying again.', Math.ceil((this.blockedUntil - this.now()) / 1000));
      };
      checkCooldown();
      const delay = Math.max(0, this.nextAt - this.now());
      if (delay) await this.wait(delay);
      checkCooldown(); this.limiter.take(); this.nextAt = this.now() + this.intervalMs;
    });
    this.queue = admitted.catch(() => {});
    return admitted;
  }
}
export function isPublicAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  // Only global-unicast IPv6; exclude documentation/special-purpose ranges.
  return isIP(ip) === 6 && /^[23][a-f0-9]{3}:/i.test(ip) && !/^200[12]:/i.test(ip);
}
export async function validateUploadURL(raw, allowedHosts, resolve = lookup) {
  let url; try { url = new URL(raw); } catch { throw new AppError('UPLOAD_DESTINATION', 502); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash || !allowedHosts.includes(url.hostname.toLowerCase()) || isIP(url.hostname)) throw new AppError('UPLOAD_DESTINATION', 502);
  let timer;
  const addresses = await Promise.race([
    resolve(url.hostname, { all: true, verbatim: true }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new AppError('UPLOAD_DESTINATION', 502)), 10000); })
  ]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new AppError('UPLOAD_DESTINATION', 502);
  return { url, address: addresses[0] };
}
export async function uploadSigned(instruction, bytes, hosts, timeoutMs) {
  if (!instruction || instruction.method !== 'PUT' || typeof instruction.headers !== 'object' || !instruction.headers) throw new AppError('UPLOAD_PROTOCOL', 502);
  const { url, address } = await validateUploadURL(instruction.url, hosts);
  const headers = {};
  for (const [key, value] of Object.entries(instruction.headers)) {
    const name = key.toLowerCase();
    if (!['content-type', 'content-length', 'content-md5', 'x-amz-acl', 'x-amz-content-sha256', 'x-amz-server-side-encryption', 'x-amz-security-token'].includes(name) || !['string', 'number'].includes(typeof value) || /[\r\n]/.test(String(value))) throw new AppError('UPLOAD_PROTOCOL', 502);
    headers[name] = String(value);
  }
  if (headers['content-length'] && Number(headers['content-length']) !== bytes.length) throw new AppError('UPLOAD_PROTOCOL', 502);
  if (headers['content-type'] && !['image/jpg', 'image/jpeg'].includes(headers['content-type'])) throw new AppError('UPLOAD_PROTOCOL', 502);
  headers['content-length'] = String(bytes.length);
  await new Promise((resolve, reject) => {
    // Pin the prevalidated address to prevent DNS rebinding; TLS still verifies hostname.
    const req = httpsRequest(url, {
      method: 'PUT', headers, agent: false,
      lookup: (_host, options, callback) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family)
    }, res => {
      res.destroy();
      if (res.statusCode >= 200 && res.statusCode < 300) resolve();
      else reject(new AppError('UPLOAD_FAILED', 502, 'The photo could not be sent for analysis. Please try again.'));
    });
    const timer = setTimeout(() => req.destroy(new Error('upload timeout')), timeoutMs);
    req.on('close', () => clearTimeout(timer));
    req.on('error', () => reject(new AppError('UPLOAD_FAILED', 502, 'The photo could not be sent for analysis. Please try again.')));
    req.end(bytes);
  });
}

async function boundedJSON(response) {
  const failure = format => {
    const error = new AppError('PROVIDER_RESPONSE', 502);
    error.diagnostic = { httpStatus: response.status, format };
    return error;
  };
  const reader = response.body?.getReader(); if (!reader) throw failure('empty_body');
  const parts = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 262144) throw failure('body_too_large'); parts.push(value); }
    if (!size) throw failure('empty_body');
    let data;
    try { data = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw failure('invalid_json'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('invalid_object');
    return data;
  } catch (error) { if (error instanceof AppError) throw error; throw failure('interrupted_body'); }
  finally { await reader.cancel().catch(() => {}); }
}
function providerFailure(status, body, retryAfter) {
  let error;
  if (status === 401) error = new AppError('PROVIDER_AUTH', 503, 'Analysis authentication is unavailable. The service owner must check the YouCam v2 API key.');
  else if (status === 403) error = new AppError('PROVIDER_FORBIDDEN', 503, 'The provider denied access. The service owner must check API access and account permissions.');
  else if (body?.error_code === 'CreditInsufficiency') error = new AppError('CREDITS_EXHAUSTED', 503, 'Analysis credits are currently unavailable.');
  else if (status === 429) error = new AppError('UPSTREAM_RATE_LIMIT', 429, 'Analysis is busy. Please wait before trying again.', retryAfter);
  else if (body?.error_code === 'OperationInvalid') error = new AppError('CLEANUP_RUNNING', 409);
  else error = new AppError('PROVIDER_ERROR', status >= 500 ? 502 : 422, 'The provider could not complete this request. Please choose another photo.');
  // Only explicit HTTP rejection, never transport/parse ambiguity, proves no new paid task.
  error.definitiveRejection = [400, 401, 429].includes(status);
  return error;
}
function retryDelay(response) {
  const raw = response.headers.get('retry-after');
  const seconds = /^\d+$/.test(raw || '') ? Number(raw) : Math.ceil((Date.parse(raw) - Date.now()) / 1000);
  return Number.isSafeInteger(seconds) ? Math.max(1, seconds) : 300;
}
export class YouCamProvider {
  constructor(config, { fetchImpl = fetch, uploadImpl = uploadSigned, limiter = new WindowLimiter(config.requestLimit ?? 200, 300000), gate } = {}) {
    this.config = config; this.fetch = fetchImpl; this.uploadImpl = uploadImpl; this.limiter = limiter;
    this.gate = gate || new ProviderRequestGate(limiter);
  }
  async api(path, body) {
    await this.gate.enter();
    let response, data;
    try {
      // Current YouCam v2 auth is the API key itself. A separate legacy secret
      // must never be sent, concatenated into the key, or exposed to the browser.
      response = await this.fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${this.config.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(this.config.upstreamTimeoutMs) });
      if (response.status === 429) {
        const retryAfter = retryDelay(response); this.gate.cooldown(retryAfter);
        await response.body?.cancel().catch(() => {});
        throw providerFailure(429, null, retryAfter);
      }
      if ([401, 403, 404].includes(response.status)) {
        await response.body?.cancel().catch(() => {});
        const error = response.status === 404 ? new AppError('PROVIDER_ENDPOINT', 502, 'The provider endpoint is unavailable.') : providerFailure(response.status, null);
        error.diagnostic = { httpStatus: response.status };
        throw error;
      }
      data = await boundedJSON(response);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('PROVIDER_CONNECTION', 502, 'The analysis connection was interrupted. Do not resubmit this photo automatically.');
    }
    if (!response.ok || (data.status !== undefined && data.status !== 200)) {
      const retryAfter = retryDelay(response);
      if (response.status === 429 || data.status === 429) this.gate.cooldown(retryAfter);
      const error = providerFailure(response.ok && Number.isInteger(data.status) ? data.status : response.status, data, retryAfter);
      error.diagnostic = { httpStatus: response.status };
      throw error;
    }
    return data;
  }
  async register(bytes) {
    const body = await this.api('/s2s/v2.0/file', { files: [{ content_type: 'image/jpg', file_name: 'huefolio-input.jpg', file_size: bytes.length }] });
    // Support the flat file schema and the same schema inside a data envelope.
    // Normalize the envelope only: retain the original file ID and upload instructions.
    const nested = body.data?.files;
    const files = body.files === undefined ? nested : body.files;
    const file = Array.isArray(files) ? files[0] : undefined;
    const problem = body.files !== undefined && nested !== undefined ? 'ambiguous_envelope'
      : !Array.isArray(files) || files.length !== 1 ? 'file_count'
      : typeof file?.file_id !== 'string' || !file.file_id || file.file_id.length > 2048 ? 'file_id'
      : !Array.isArray(file.requests) || file.requests.length !== 1 ? 'upload_instructions' : null;
    if (problem) {
      const error = new AppError('PROVIDER_RESPONSE', 502);
      error.diagnostic = { format: 'unexpected_file_schema', fileEnvelope: body.files !== undefined ? 'files' : nested !== undefined ? 'data.files' : 'missing', problem };
      throw error;
    }
    return file;
  }
  // Official v2 read-only pricing endpoint: checks bearer-key acceptance without
  // registering an image, uploading a photo or creating an analysis task.
  async verifyCredentials() { await this.api('/s2s/v2.0/credit/feature-cost?page_size=1'); }
  async upload(file, bytes) { await this.uploadImpl(file.requests[0], bytes, this.config.uploadHosts, this.config.upstreamTimeoutMs); }
  async submit(fileId) {
    const result = await this.api('/s2s/v2.0/task/skin-tone-analysis', { src_file_id: fileId, face_angle_strictness_level: 'high' });
    if (typeof result.data?.task_id !== 'string' || !result.data.task_id || result.data.task_id.length > 2048) throw new AppError('PROVIDER_RESPONSE', 502);
    return result.data.task_id;
  }
  async poll(taskId) {
    const result = await this.api('/s2s/v2.0/task/skin-tone-analysis/' + encodeURIComponent(taskId));
    if (result.status !== 200 || !['running', 'success', 'error'].includes(result.data?.task_status)) throw new AppError('PROVIDER_RESPONSE', 502);
    return result.data;
  }
  async delete(taskId) { await this.api('/s2s/v2.0/task/delete', { task_id: taskId }); }
}
