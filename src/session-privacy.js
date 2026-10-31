// Runtime state only; browser leave prompts are best effort and use browser-owned wording.
export const hasSessionData = s => Boolean(s.photo || s.photoLoading || s.job || s.profile || s.demo || s.userColors?.length);
export const isSessionExpired = (s, now = Date.now()) => Number.isFinite(s.expiresAt) && s.expiresAt <= now;
export function createLeaveGuard(getSession, target = window) {
  let attached = false;
  const beforeUnload = event => {
    if (!hasSessionData(getSession())) return;
    event.preventDefault(); event.returnValue = true;
  };
  return {
    sync() {
      const needed = hasSessionData(getSession());
      if (needed && !attached) target.addEventListener('beforeunload', beforeUnload);
      if (!needed && attached) target.removeEventListener('beforeunload', beforeUnload);
      attached = needed;
    },
    dispose() { if (attached) target.removeEventListener('beforeunload', beforeUnload); attached = false; }
  };
}
