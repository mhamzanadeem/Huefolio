// Health traffic only: no photos, credentials, provider calls or session data.
export function startBackendHeartbeat(backendURL, { fetchImpl = fetch, target = window, schedule = setInterval, unschedule = clearInterval, onAlive = () => {} } = {}) {
  if (!backendURL) return () => {};
  let timer = null, controller = null, stopped = true, revision = 0;
  async function ping() {
    if (stopped || controller) return;
    const current = new AbortController(), requestRevision = revision;
    controller = current;
    try {
      const response = await fetchImpl(`${backendURL}/alive`, { method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([current.signal, AbortSignal.timeout(25000)]) });
      await response.body?.cancel().catch(() => {});
      if (response.ok && !stopped && requestRevision === revision) await onAlive();
    } catch { /* Render may be waking up or the browser may be offline. */ }
    finally { if (controller === current) controller = null; }
  }
  function start() {
    if (!stopped) return;
    stopped = false; revision++;
    void ping(); timer = schedule(() => { void ping(); }, 30000);
  }
  function stop() {
    stopped = true; revision++;
    if (timer !== null) unschedule(timer);
    timer = null; controller?.abort(); controller = null;
  }
  function restore(event) { if (event.persisted) start(); }
  target.addEventListener('pagehide', stop);
  target.addEventListener('pageshow', restore);
  target.addEventListener('online', ping);
  start();
  return () => {
    stop(); target.removeEventListener('pagehide', stop);
    target.removeEventListener('pageshow', restore); target.removeEventListener('online', ping);
  };
}
