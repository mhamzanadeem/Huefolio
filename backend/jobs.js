import { createHash, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppError, safeError } from './errors.js';
import { prepareImage } from './image.js';
import { normalizeResults } from './normalize.js';
const hash = token => createHash('sha256').update(token).digest();
const noFace = new Set(['error_no_face', 'error_multiple_people', 'error_face_position_invalid', 'error_face_position_too_small', 'error_face_position_out_of_boundary', 'error_face_not_forward_facing', 'error_pose', 'error_large_face_angle']);
export class JobManager {
  constructor(config, provider, { prepare = prepareImage, wait = sleep, now = Date.now } = {}) {
    this.config = config; this.provider = provider; this.prepare = prepare; this.wait = wait; this.now = now;
    this.jobs = new Map(); this.active = 0; this.reserved = 0; this.armed = !config.reconcile;
    this.budget = config.budget; this.stopping = false;
    this.sweeper = setInterval(() => this.sweep(), 30000); this.sweeper.unref();
  }
  arm(units) {
    if (this.armed || this.active || this.reserved) throw new AppError('BUDGET_ALREADY_ARMED', 409, 'The process budget has already been initialized.');
    if (!Number.isInteger(units) || units < 0 || units > this.config.budget) throw new AppError('INVALID_BUDGET', 400);
    this.budget = units; this.armed = true;
  }
  sweep() {
    for (const [id, job] of this.jobs) if (this.now() >= job.expiresAt) {
      job.result = null; job.error = null; job.cancelled = true;
      if (!job.active) this.jobs.delete(id);
    }
  }
  authorize(id, token) {
    const job = this.jobs.get(id);
    if (!job || this.now() >= job.expiresAt || !timingSafeEqual(job.tokenHash, hash(token))) throw new AppError('SESSION_EXPIRED', 404, 'This analysis session is unavailable or has expired.');
    return job;
  }
  admit(id, token) {
    this.sweep();
    if (this.jobs.has(id)) return { job: this.authorize(id, token), duplicate: true };
    if (!this.config.enabled) throw new AppError('ANALYSIS_DISABLED', 503, 'Connected analysis is not enabled. You can explore sample colors.');
    if (!this.armed || this.stopping) throw new AppError('ANALYSIS_UNAVAILABLE', 503, 'Analysis is temporarily unavailable. You can explore sample colors.');
    if (this.reserved + 20 > this.budget) throw new AppError('BUDGET_EXHAUSTED', 503, 'Analysis credits are currently unavailable.');
    if (this.active >= this.config.maxConcurrent || this.jobs.size >= this.config.maxJobs) throw new AppError('BUSY', 429, 'Analysis is busy. Please try again in a moment.', 15);
    const job = { id, tokenHash: hash(token), stage: 'receiving', createdAt: this.now(), expiresAt: this.now() + this.config.resultTtlMs, result: null, error: null, cancelled: false, active: true, cleanup: 'not_started', taskId: null, mayBeCharged: false };
    this.jobs.set(id, job); this.active++; this.reserved += 20;
    return { job, duplicate: false };
  }
  view(job) {
    return { id: job.id, stage: job.cancelled ? 'cancelled' : job.stage, expiresAt: job.expiresAt, cleanup: job.cleanup,
      ...(job.result && !job.cancelled ? { result: job.result } : {}), ...(job.error && !job.cancelled ? { error: job.error } : {}) };
  }
  // Keep only bounded cleanup/idempotency metadata, never facial data after release.
  cancel(job) { job.cancelled = true; job.result = null; job.error = null; }
  fail(job, error) {
    const safe = safeError(error); job.stage = 'error'; job.result = null;
    job.error = { code: safe.code, message: safe.message };
  }
  finish(job) {
    if (!job.active) return;
    job.active = false; this.active--;
    if (!job.mayBeCharged) this.reserved -= 20;
    job.taskId = null;
  }
  rejectBody(job, error) { this.fail(job, error); this.finish(job); }
  async cleanup(job) {
    if (!job.taskId) return;
    job.cleanup = 'pending';
    for (let n = 0; n < 3; n++) {
      try { await this.provider.delete(job.taskId); job.cleanup = 'confirmed'; return; }
      catch (error) {
        if (n < 2) await this.wait(Math.max(1000 * 2 ** n, (error.retryAfter || 0) * 1000));
      }
    }
    job.cleanup = 'unconfirmed';
  }
  async process(job, input, mime) {
    let clean = null, uploaded = false, terminal = false;
    try {
      if (job.cancelled) return;
      job.stage = 'validating';
      clean = await this.prepare(input, mime, this.config.maxBytes);
      input.fill(0); input = null;
      if (job.cancelled) return;
      job.stage = 'uploading';
      const file = await this.provider.register(clean);
      if (job.cancelled) return;
      // Provider file registration alone does not upload image bytes.
      uploaded = true;
      await this.provider.upload(file, clean);
      clean.fill(0); clean = null;
      if (job.cancelled) { job.cleanup = 'unconfirmed'; return; }
      job.stage = 'submitting'; job.mayBeCharged = true;
      try { job.taskId = await this.provider.submit(file.file_id); }
      catch (error) { if (error.definitiveRejection || error.code === 'UPSTREAM_RATE_LIMIT') job.mayBeCharged = false; throw error; }
      job.stage = 'processing';
      let delay = this.config.pollMs;
      while (!this.stopping && this.now() - job.createdAt < this.config.cleanupMs) {
        if (!job.cancelled && this.now() - job.createdAt > this.config.interactiveMs) job.stage = 'timed_out';
        try {
          const response = await this.provider.poll(job.taskId);
          delay = this.config.pollMs;
          if (response.task_status === 'success') {
            terminal = true;
            if (!job.cancelled) { job.result = normalizeResults(response.results); job.stage = 'success'; }
            break;
          }
          if (response.task_status === 'error') {
            terminal = true; job.mayBeCharged = false;
            const code = typeof response.error === 'string' ? response.error : '';
            throw new AppError('IMAGE_ANALYSIS_FAILED', 422, noFace.has(code) || code.startsWith('error_face_angle_') ? 'Use a clear, centered photo of one person facing the camera.' : 'This photo could not be analyzed. Choose another photo.');
          }
        } catch (error) {
          if (terminal) throw error;
          if (!['UPSTREAM_RATE_LIMIT', 'PROVIDER_CONNECTION', 'PROVIDER_ERROR'].includes(error.code) || error.status === 422) throw error;
          delay = Math.max(Math.min(30000, delay * 2), (error.retryAfter || 0) * 1000);
        }
        await this.wait(Math.min(delay, Math.max(0, this.config.cleanupMs - (this.now() - job.createdAt))));
      }
      if (!terminal && !job.cancelled) this.fail(job, new AppError('ANALYSIS_TIMEOUT', 504, 'Analysis timed out. It may still complete at the provider; do not automatically resubmit.'));
    } catch (error) {
      if (!job.cancelled) this.fail(job, error);
    } finally {
      input?.fill(0); clean?.fill(0);
      if (job.taskId) await this.cleanup(job);
      else if (uploaded) job.cleanup = 'unconfirmed';
      if (job.cancelled) { job.result = null; job.error = null; }
      this.finish(job);
    }
  }
  close() { this.stopping = true; clearInterval(this.sweeper); }
}
