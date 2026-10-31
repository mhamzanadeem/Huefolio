import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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
  const reader = response.body?.getReader(); if (!reader) throw new AppError('PROVIDER_RESPONSE', 502);
  const parts = []; let size = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 262144) throw new AppError('PROVIDER_RESPONSE', 502); parts.push(value); }
    return JSON.parse(Buffer.concat(parts).toString('utf8'));
  } catch { throw new AppError('PROVIDER_RESPONSE', 502); }
  finally { await reader.cancel().catch(() => {}); }
}
function providerFailure(status, body, retryAfter) {
  let error;
  if (status === 401) error = new AppError('PROVIDER_AUTH', 503, 'Analysis is temporarily unavailable.');
  else if (body?.error_code === 'CreditInsufficiency') error = new AppError('CREDITS_EXHAUSTED', 503, 'Analysis credits are currently unavailable.');
  else if (status === 429) error = new AppError('UPSTREAM_RATE_LIMIT', 429, 'Analysis is busy. Please wait before trying again.', retryAfter);
  else if (body?.error_code === 'OperationInvalid') error = new AppError('CLEANUP_RUNNING', 409);
  else error = new AppError('PROVIDER_ERROR', status >= 500 ? 502 : 422, 'The provider could not complete this request. Please choose another photo.');
  // Only explicit HTTP rejection, never transport/parse ambiguity, proves no new paid task.
  error.definitiveRejection = [400, 401, 429].includes(status);
  return error;
}
export class YouCamProvider {
  constructor(config, { fetchImpl = fetch, uploadImpl = uploadSigned, limiter = new WindowLimiter() } = {}) { this.config = config; this.fetch = fetchImpl; this.uploadImpl = uploadImpl; this.limiter = limiter; }
  async api(path, body) {
    this.limiter.take();
    let response, data;
    try {
      response = await this.fetch(API + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${this.config.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error', signal: AbortSignal.timeout(this.config.upstreamTimeoutMs) });
      data = await boundedJSON(response);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('PROVIDER_CONNECTION', 502, 'The analysis connection was interrupted. Do not resubmit this photo automatically.');
    }
    if (!response.ok || (data.status !== undefined && data.status !== 200)) {
      const rawRetry = response.headers.get('retry-after');
      const seconds = /^\d+$/.test(rawRetry || '') ? Number(rawRetry) : Math.ceil((Date.parse(rawRetry) - Date.now()) / 1000);
      throw providerFailure(response.status, data, Number.isFinite(seconds) ? Math.max(1, Math.min(seconds, 300)) : 10);
    }
    return data;
  }
  async register(bytes) {
    const body = await this.api('/s2s/v2.0/file', { files: [{ content_type: 'image/jpg', file_name: 'huefolio-input.jpg', file_size: bytes.length }] });
    const file = body.files?.[0];
    if (body.files?.length !== 1 || typeof file?.file_id !== 'string' || !file.file_id || file.file_id.length > 2048 || file.requests?.length !== 1) throw new AppError('PROVIDER_RESPONSE', 502);
    return file;
  }
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
