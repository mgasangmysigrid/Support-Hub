import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const APP_NAME = "support_hub";
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
const SESSION_KEY = "analytics_session_id";
const LOGIN_TRACKED_KEY = "analytics_login_tracked";

// ─── Route → Module/Event Map ──────────────────────────────────────────
const ROUTE_MODULE_MAP: Record<string, { module: string; event: string }> = {
  "/": { module: "home", event: "viewed_home" },
  "/dashboard": { module: "dashboard", event: "viewed_dashboard" },
  "/tickets/create": { module: "tickets", event: "viewed_create_ticket" },
  "/tickets": { module: "tickets", event: "viewed_my_tickets" },
  "/tickets/analytics": { module: "analytics", event: "viewed_ticket_analytics" },
  "/department": { module: "tickets", event: "viewed_department_queue" },
  "/leave/my-leave": { module: "leave", event: "viewed_my_leave" },
  "/leave/calendar": { module: "leave", event: "viewed_leave_calendar" },
  "/leave/approvals": { module: "leave", event: "viewed_leave_approvals" },
  "/leave/overview": { module: "leave", event: "viewed_leave_overview" },
  "/leave/endorsements": { module: "endorsements", event: "viewed_endorsements" },
  "/leave/endorsements/new": { module: "endorsements", event: "viewed_create_endorsement" },
  "/notifications": { module: "notifications", event: "viewed_notifications" },
  "/profile": { module: "profile", event: "viewed_my_profile" },
  "/directory": { module: "directory", event: "viewed_directory" },
  "/admin": { module: "admin", event: "viewed_admin" },
  "/documents": { module: "documents", event: "viewed_documents" },
  "/knowledge-base": { module: "knowledge_base", event: "viewed_knowledge_base" },
};

function getModuleFromPath(pathname: string): { module: string; event: string } | null {
  if (ROUTE_MODULE_MAP[pathname]) return ROUTE_MODULE_MAP[pathname];
  if (pathname.startsWith("/tickets/") && pathname !== "/tickets/create" && pathname !== "/tickets/analytics") {
    if (pathname.endsWith("/survey")) return { module: "tickets", event: "viewed_ticket_survey" };
    return { module: "tickets", event: "opened_ticket" };
  }
  if (pathname.startsWith("/leave/endorsements/")) return { module: "endorsements", event: "opened_endorsement" };
  if (pathname.startsWith("/profile/")) return { module: "profile", event: "viewed_user_profile" };
  return null;
}

// ─── Session ID Management ─────────────────────────────────────────────
function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export function resetSessionId() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(LOGIN_TRACKED_KEY);
}

// ─── Login Tracking (once per browser session) ─────────────────────────
export async function trackLogin(userId: string) {
  if (sessionStorage.getItem(LOGIN_TRACKED_KEY)) return;
  sessionStorage.setItem(LOGIN_TRACKED_KEY, "1");

  const sid = getSessionId();
  try {
    await Promise.all([
      supabase.from("user_login_events" as any).insert({
        user_id: userId,
        app_name: APP_NAME,
        session_id: sid,
        user_agent: navigator.userAgent,
        login_at: new Date().toISOString(),
      } as any),
      supabase.from("user_sessions" as any).insert({
        id: sid,
        user_id: userId,
        app_name: APP_NAME,
        started_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_active: true,
        active_seconds: 0,
      } as any),
    ]);
  } catch (e) {
    console.warn("[ActivityTracker] login track error:", e);
  }
}

// ─── Manual Event Tracking ─────────────────────────────────────────────
export async function trackActivity(
  userId: string,
  module_name: string,
  event_name: string,
  entity_type?: string,
  entity_id?: string,
  metadata?: Record<string, any>
) {
  try {
    await supabase.from("user_activity_events" as any).insert({
      user_id: userId,
      app_name: APP_NAME,
      session_id: getSessionId(),
      module_name,
      event_name,
      entity_type: entity_type || null,
      entity_id: entity_id || null,
      metadata: metadata || {},
      occurred_at: new Date().toISOString(),
    } as any);
  } catch (e) {
    // Silent — analytics should never block UX
  }
}

// ─── Main Hook ─────────────────────────────────────────────────────────
export function useActivityTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const lastTrackedPath = useRef("");

  // Idle detection state
  const isIdle = useRef(false);
  const lastActivityTs = useRef(Date.now());
  const accumulatedActive = useRef(0);
  const activeIntervalStart = useRef(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>();
  const idleCheckRef = useRef<ReturnType<typeof setInterval>>();

  // ── Reset idle on user activity ──
  const onUserActivity = useCallback(() => {
    lastActivityTs.current = Date.now();
    if (isIdle.current) {
      isIdle.current = false;
      activeIntervalStart.current = Date.now();
    }
  }, []);

  // ── Login tracking (once per session) ──
  useEffect(() => {
    if (user) trackLogin(user.id);
  }, [user]);

  // ── Page view tracking ──
  useEffect(() => {
    if (!user) return;
    const path = location.pathname;
    if (path === lastTrackedPath.current) return;
    lastTrackedPath.current = path;
    const mapping = getModuleFromPath(path);
    if (mapping) trackActivity(user.id, mapping.module, mapping.event);
  }, [location.pathname, user]);

  // ── Idle detection + heartbeat ──
  useEffect(() => {
    if (!user) return;

    const sid = getSessionId();
    accumulatedActive.current = 0;
    activeIntervalStart.current = Date.now();
    isIdle.current = false;
    lastActivityTs.current = Date.now();

    const activityEvents = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    activityEvents.forEach(evt => document.addEventListener(evt, onUserActivity, { passive: true }));

    // Idle check every 30s
    idleCheckRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastActivityTs.current;

      if (!isIdle.current && elapsed >= IDLE_TIMEOUT_MS) {
        const activeChunk = Math.floor((lastActivityTs.current - activeIntervalStart.current) / 1000);
        accumulatedActive.current += Math.max(0, activeChunk);
        isIdle.current = true;
      }
    }, 30_000);

    // Heartbeat: update session every 60s
    heartbeatRef.current = setInterval(async () => {
      let totalActive = accumulatedActive.current;
      if (!isIdle.current) {
        totalActive += Math.floor((Date.now() - activeIntervalStart.current) / 1000);
      }

      try {
        await (supabase.from("user_sessions" as any) as any)
          .update({
            last_seen_at: new Date().toISOString(),
            active_seconds: totalActive,
            is_active: !isIdle.current && !document.hidden,
          })
          .eq("id", sid);
      } catch (e) { /* silent */ }
    }, HEARTBEAT_INTERVAL_MS);

    // Visibility change
    const onVisibility = () => {
      if (document.hidden) {
        if (!isIdle.current) {
          const chunk = Math.floor((Date.now() - activeIntervalStart.current) / 1000);
          accumulatedActive.current += Math.max(0, chunk);
          isIdle.current = true;
        }
      } else {
        isIdle.current = false;
        activeIntervalStart.current = Date.now();
        lastActivityTs.current = Date.now();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Cleanup: end session
    return () => {
      activityEvents.forEach(evt => document.removeEventListener(evt, onUserActivity));
      document.removeEventListener("visibilitychange", onVisibility);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (idleCheckRef.current) clearInterval(idleCheckRef.current);

      let totalActive = accumulatedActive.current;
      if (!isIdle.current) {
        totalActive += Math.floor((Date.now() - activeIntervalStart.current) / 1000);
      }

      // Fire-and-forget session close
      (supabase.from("user_sessions" as any) as any)
        .update({
          last_seen_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
          active_seconds: totalActive,
          is_active: false,
        })
        .eq("id", sid)
        .then(() => {});
    };
  }, [user, onUserActivity]);
}

// ─── Event Taxonomy Constants ──────────────────────────────────────────
export const ANALYTICS_EVENTS = {
  CREATED_TICKET: { module: "tickets", event: "created_ticket" },
  REPLIED_TICKET: { module: "tickets", event: "replied_ticket" },
  UPDATED_TICKET_STATUS: { module: "tickets", event: "updated_ticket_status" },
  SUBMITTED_LEAVE: { module: "leave", event: "submitted_leave" },
  APPROVED_LEAVE: { module: "leave", event: "approved_leave" },
  OPENED_ENDORSEMENT: { module: "endorsements", event: "opened_endorsement" },
  ACKNOWLEDGED_ENDORSEMENT: { module: "endorsements", event: "acknowledged_endorsement" },
  VIEWED_DOCUMENT: { module: "documents", event: "viewed_document" },
  SIGNED_DOCUMENT: { module: "documents", event: "signed_document" },
  UPLOADED_DOCUMENT: { module: "documents", event: "uploaded_document" },
  POSTED_UPDATE: { module: "updates", event: "posted_update" },
  COMMENTED_UPDATE: { module: "updates", event: "commented_update" },
  REACTED_UPDATE: { module: "updates", event: "reacted_update" },
  VIEWED_PROFILE: { module: "profile", event: "viewed_profile" },
  UPLOADED_FEATURED_PHOTO: { module: "profile", event: "uploaded_featured_photo" },
} as const;
