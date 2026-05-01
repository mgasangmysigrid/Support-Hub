/**
 * Centralized browser-session-only auth module.
 *
 * Ensures users are logged out when the browser is fully closed,
 * while staying logged in during normal refreshes and across tabs.
 */

const SESSION_MARKER = "mysigrid-session-alive";
const BROADCAST_CHANNEL_NAME = "mysigrid-auth-sync";

/**
 * Derives the Supabase auth storage key from the project URL.
 * Supabase stores the session in localStorage under a key like:
 *   sb-<ref>-auth-token
 */
function getSupabaseAuthKey(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url) return null;
    const ref = new URL(url).hostname.split(".")[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return null;
  }
}

/**
 * Call ONCE before React renders (in main.tsx).
 *
 * If this is a fresh browser session (sessionStorage marker absent)
 * AND there is a persisted Supabase token in localStorage,
 * remove the token so the auth listener sees no session.
 *
 * On a normal page refresh sessionStorage survives, so
 * the token is left intact and the user stays logged in.
 */
export function enforceSessionOnlyAuth(): void {
  const alreadyAlive = sessionStorage.getItem(SESSION_MARKER);

  if (!alreadyAlive) {
    // Fresh browser session – wipe any stale persisted token
    const key = getSupabaseAuthKey();
    if (key && localStorage.getItem(key)) {
      localStorage.removeItem(key);
    }
  }

  // Mark this tab as alive for subsequent refreshes
  sessionStorage.setItem(SESSION_MARKER, "1");

  // Set up cross-tab sync
  initBroadcastChannel();
}

/**
 * Returns true when the current browser session is considered valid
 * (i.e. the session marker is present).
 */
export function isAuthStateValid(): boolean {
  return sessionStorage.getItem(SESSION_MARKER) === "1";
}

/**
 * Clears all local auth artefacts and broadcasts to other tabs.
 */
export function clearAuthState(): void {
  const key = getSupabaseAuthKey();
  if (key) localStorage.removeItem(key);
  sessionStorage.removeItem(SESSION_MARKER);
  broadcastSignOut();
}

// ── BroadcastChannel (multi-tab safety) ──────────────────────────

let channel: BroadcastChannel | null = null;

function initBroadcastChannel(): void {
  try {
    if (typeof BroadcastChannel === "undefined") return;
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = (event) => {
      if (event.data === "sign-out") {
        // Another tab signed out – clear this tab too
        const key = getSupabaseAuthKey();
        if (key) localStorage.removeItem(key);
        sessionStorage.removeItem(SESSION_MARKER);
        // Force reload to show login screen
        window.location.reload();
      }
    };
  } catch {
    // BroadcastChannel not available – degrade silently
  }
}

function broadcastSignOut(): void {
  try {
    channel?.postMessage("sign-out");
  } catch {
    // ignore
  }
}
