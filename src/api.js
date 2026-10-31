import { BACKEND_URL } from './config.js';
export class AnalysisError extends Error { constructor(message, code) { super(message); this.code = code; } }
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
export function newJob() { return { id: crypto.randomUUID(), token: token() }; }
async function request(path, options = {}, job) {
  if (!BACKEND_URL) throw new AnalysisError('Connected analysis is not configured. You can explore sample colors.', 'ANALYSIS_DISABLED');
  let response;
  try {
    response = await fetch(BACKEND_URL + path, { ...options, credentials: 'omit', cache: 'no-store', headers: { ...options.headers, ...(job ? { Authorization: `Bearer ${job.token}` } : {}) } });
  } catch (error) { if (error.name === 'AbortError') throw error; throw new AnalysisError('The connection was interrupted. We will check the existing analysis; no new task will be submitted.', 'CONNECTION'); }
  let body; try { body = await response.json(); } catch { throw new AnalysisError('The analysis service returned an unreadable response.', 'RESPONSE'); }
  if (!response.ok) throw new AnalysisError(body.error?.message || 'Analysis is temporarily unavailable.', body.error?.code || 'SERVICE_ERROR');
  return body;
}
export const capabilities = () => request('/v1/capabilities', { signal: AbortSignal.timeout(10000) });
export const submitAnalysis = (job, blob, signal) => request('/v1/analyses', { method: 'POST', body: blob, signal, headers: { 'Content-Type': blob.type, 'X-Request-Id': job.id, 'X-Huefolio-Consent': 'youcam-color-v1' } }, job);
export const analysisStatus = (job, signal) => request('/v1/analyses/' + job.id, { signal }, job);
export const cancelAnalysis = job => request('/v1/analyses/' + job.id, { method: 'DELETE', keepalive: true, signal: AbortSignal.timeout(10000) }, job).catch(() => {});
