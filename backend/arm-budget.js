// Operator tool. Credentials are read from the environment, never CLI arguments.
const origin = process.argv[3] || process.env.HUEFOLIO_BACKEND_URL;
const units = Number(process.argv[2]);
try {
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) || !Number.isInteger(units) || units < 0 || !process.env.HUEFOLIO_ADMIN_TOKEN) throw new Error();
  const response = await fetch(url.origin + '/internal/budget', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': process.env.HUEFOLIO_ADMIN_TOKEN }, body: JSON.stringify({ remainingUnits: units }), signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) throw new Error();
  console.log('This backend process budget is initialized.');
} catch { console.error('Budget initialization failed. Check the URL, available allocation, server state, and operator environment.'); process.exitCode = 1; }
