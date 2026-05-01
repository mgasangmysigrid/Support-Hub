import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sanitizePhotoNotificationLinks } from "@/lib/notification-utils";

/**
 * Returns a map of photo_id -> unread mention count for the current user.
 */
export function usePhotoMentionBadges() {
  const { user } = useAuth();

  const { data: mentionMap = {} } = useQuery({
    queryKey: ["photo-mention-badges", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, link")
        .eq("user_id", user!.id)
        .eq("is_read", false)
        .eq("type", "photo_mention");
      if (error) throw error;

      const validNotifications = await sanitizePhotoNotificationLinks(data ?? []);
      const map: Record<string, number> = {};
      for (const n of validNotifications) {
        map[n.photoId] = (map[n.photoId] || 0) + 1;
      }
      return map;
    },
    refetchInterval: 30000,
  });

  return mentionMap;
}
