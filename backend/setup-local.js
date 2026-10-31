import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { YouCamProvider, validateUploadURL } from './provider.js';
import { AppError, safeError } from './errors.js';

export async function configureLocal({ envPath = new URL('.env', import.meta.url), providerFactory = config => new YouCamProvider(config), verifyDestination = validateUploadURL, makeSample = async () => createRequire(import.meta.url)('sharp')({ create: { width: 320, height: 320, channels: 3, background: '#888888' } }).jpeg().toBuffer() } = {}) {
  const source = await readFile(envPath, 'utf8'), env = parseEnv(source);
  if (env.NODE_ENV === 'production') throw new AppError('LOCAL_SETUP_ONLY', 400);
  const config = loadConfig({ ...env, YOUCAM_INTEGRATION_ENABLED: 'false' });
  if (!config.apiKey || config.adminToken.length < 32) throw new AppError('CONFIG_REQUIRED', 400);
  const provider = providerFactory(config);
  let bytes, stage = 'credential-check';
  try {
    await provider.verifyCredentials();
    stage = 'preparing-metadata';
    bytes = await makeSample();
    // Only metadata is registered. No image bytes are uploaded and no task is created.
    stage = 'file-registration';
    const file = await provider.register(bytes), instruction = file.requests?.[0];
    if (instruction?.method !== 'PUT') throw new AppError('UPLOAD_PROTOCOL', 502);
    let destination; try { destination = new URL(instruction.url); } catch { throw new AppError('UPLOAD_DESTINATION', 502); }
    stage = 'upload-host-validation';
    await verifyDestination(instruction.url, [destination.hostname]);
    const hosts = [...new Set([...config.uploadHosts, destination.hostname.toLowerCase()])].join(',');
    let updated = source;
    for (const [name, value] of [['YOUCAM_UPLOAD_HOSTS', `"${hosts}"`], ['YOUCAM_INTEGRATION_ENABLED', 'true']]) {
      const pattern = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`, 'm');
      updated = pattern.test(updated) ? updated.replace(pattern, `${name}=${value}`) : updated + `\n${name}=${value}\n`;
    }
    stage = 'saving-configuration';
    if (await readFile(envPath, 'utf8') !== source) throw new AppError('ENV_CHANGED', 409);
    const temporary = typeof envPath === 'string' ? `${envPath}.setup-${randomUUID()}` : new URL(`.env.setup-${randomUUID()}`, envPath);
    try { await writeFile(temporary, updated, { flag: 'wx', mode: 0o600 }); await rename(temporary, envPath); }
    finally { await unlink(temporary).catch(() => {}); }
    return { configured: true };
  } catch (error) {
    const safe = safeError(error); safe.setupStage = stage; throw safe;
  } finally { bytes?.fill(0); }
}

export function formatSetupFailure(error) {
  const safe = safeError(error), details = [], diagnostic = safe.diagnostic;
  if (['credential-check', 'preparing-metadata', 'file-registration', 'upload-host-validation', 'saving-configuration'].includes(safe.setupStage)) details.push(`step=${safe.setupStage}`);
  if (Number.isInteger(diagnostic?.httpStatus) && diagnostic.httpStatus >= 100 && diagnostic.httpStatus <= 599) details.push(`HTTP=${diagnostic.httpStatus}`);
  if (['empty_body', 'body_too_large', 'invalid_json', 'invalid_object', 'interrupted_body', 'unexpected_file_schema'].includes(diagnostic?.format)) details.push(`response=${diagnostic.format}`);
  if (['files', 'data.files', 'missing'].includes(diagnostic?.fileEnvelope)) details.push(`envelope=${diagnostic.fileEnvelope}`);
  if (['ambiguous_envelope', 'file_count', 'file_id', 'upload_instructions'].includes(diagnostic?.problem)) details.push(`field=${diagnostic.problem}`);
  const explanation = {
    PROVIDER_AUTH: 'YouCam rejected the API key. Check YOUCAM_API_KEY in backend/.env against the v2 API console.',
    PROVIDER_FORBIDDEN: 'Access was denied. Check account/API permissions; a network security filter can also return HTTP 403.',
    PROVIDER_ENDPOINT: 'The requested API route returned HTTP 404. Check provider endpoint availability.',
    PROVIDER_CONNECTION: 'The request could not complete. Check network, proxy/firewall settings and provider availability.',
    PROVIDER_RESPONSE: 'The response could not be read as the expected API JSON. This alone does not mean the API key is wrong.',
    CONFIG_REQUIRED: 'backend/.env needs YOUCAM_API_KEY and a HUEFOLIO_ADMIN_TOKEN of at least 32 characters.',
    UPSTREAM_RATE_LIMIT: 'YouCam rate-limited the request. Wait before trying again.'
  }[safe.code] || 'The setup step failed. Check the reported step before changing credentials.';
  return `Local setup did not complete (${safe.code})${details.length ? `: ${details.join('; ')}` : ''}. ${explanation} Credentials are read from backend/.env, not the root .env or .env5. No credentials, response bodies or signed URLs are printed.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await configureLocal();
    console.log('Local setup complete: API key accepted and exact upload host discovered from the provider. Existing credentials were preserved. No image was uploaded and no analysis task was created. Start or restart the backend to load these settings; the configured budget initializes automatically unless manual mode is explicitly enabled.');
  } catch (error) {
    console.error(formatSetupFailure(error));
    process.exitCode = 1;
  }
}
