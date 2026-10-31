import { loadConfig } from './config.js';
import { YouCamProvider } from './provider.js';
import { safeError, AppError } from './errors.js';

// Operator-only CLI. No credentials, response bodies or account details are logged.
try {
  const config = loadConfig({ ...process.env, YOUCAM_INTEGRATION_ENABLED: 'false' });
  if (!config.apiKey) throw new AppError('API_KEY_REQUIRED', 400);
  await new YouCamProvider(config).verifyCredentials();
  console.log('YouCam v2 accepted the API key on the read-only feature-cost endpoint. No photo or analysis task was submitted. Upload hosts, feature eligibility and end-to-end analysis still need verification.');
} catch (error) {
  console.error(`YouCam verification did not pass (${safeError(error).code}). Check network access and the v2 API key. The separate secret is not sent by v2 authentication.`);
  process.exitCode = 1;
}
