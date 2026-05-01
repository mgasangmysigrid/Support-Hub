import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Requests browser notification permission and listens for new notifications
 * via Supabase realtime. Shows in-app toasts and browser notifications.
 */
export function useNotificationPush() {
  const { user } = useAuth();
  const permissionRef = useRef<NotificationPermission>("default");

  // Request browser notification permission on mount
  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        permissionRef.current = "granted";
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((perm) => {
          permissionRef.current = perm;
        });
      }
    }
  }, []);

  // Listen for new notifications via realtime
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("push-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const notif = payload.new as {
            title: string;
            body: string;
            link?: string | null;
          };

          // In-app toast
          toast(notif.title, {
            description: notif.body,
            action: notif.link
              ? {
                  label: "View",
                  onClick: () => {
                    window.location.href = notif.link!;
                  },
                }
              : undefined,
          });

          // Browser notification (when tab not focused)
          if (
            document.hidden &&
            "Notification" in window &&
            permissionRef.current === "granted"
          ) {
            const browserNotif = new Notification(notif.title, {
              body: notif.body,
              icon: "/favicon.ico",
              tag: `notif-${Date.now()}`,
            });

            if (notif.link) {
              browserNotif.onclick = () => {
                window.focus();
                window.location.href = notif.link!;
              };
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
}
