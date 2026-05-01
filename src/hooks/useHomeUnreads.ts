import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sanitizePhotoNotificationLinks } from "@/lib/notification-utils";

export interface UnreadBulletin {
  id: string;
  title: string;
  updated_at: string;
}

/** Parsed bulletin mention notification with post/comment targeting */
export interface BulletinMentionNotification {
  id: string;          // notification id
  postId: string;
  commentId: string | null;
  source: "post" | "comment";
  type: string;
}

/**
 * Single source of truth for Home unread state.
 * All badge counts, section indicators, and the sidebar badge
 * MUST derive from these datasets:
 *   - unreadBulletins: active bulletin posts the user hasn't read (or were updated after last read)
 *   - unreadMentionPhotoIds: Set of photo IDs with unread @-mentions for the current user
 *   - bulletinMentions: unread bulletin mention notifications with post/comment targeting
 */
export function useHomeUnreads() {
  const { user } = useAuth();

  const { data: bulletinPosts = [] } = useQuery({
    queryKey: ["home-unreads-bulletins", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_posts")
        .select("id, title, updated_at")
        .eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const { data: bulletinReads = [] } = useQuery({
    queryKey: ["home-unreads-bulletin-reads", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_reads")
        .select("bulletin_post_id, read_at")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  const unreadBulletins = useMemo<UnreadBulletin[]>(() => {
    const readMap = new Map<string, string>();
    bulletinReads.forEach((r) => readMap.set(r.bulletin_post_id, r.read_at));
    return bulletinPosts.filter((p) => {
      const readAt = readMap.get(p.id);
      return !readAt || new Date(p.updated_at) > new Date(readAt);
    });
  }, [bulletinPosts, bulletinReads]);

  // Bulletin mention notifications (both post mentions and comment mentions)
  const { data: bulletinMentions = [] } = useQuery({
    queryKey: ["home-unreads-bulletin-mentions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, link, type")
        .eq("user_id", user!.id)
        .eq("is_read", false)
        .in("type", ["bulletin_mention", "bulletin_comment_mention", "bulletin_everyone"]);
      if (error) throw error;
      return (data ?? []).map((n): BulletinMentionNotification | null => {
        if (!n.link) return null;
        // Parse link format: /?bulletin=<postId> or /?bulletin=<postId>&comment=<commentId>
        const bulletinMatch = n.link.match(/[?&]bulletin=([0-9a-f-]{36})/i);
        const sectionMatch = n.link.match(/[?&]section=bulletin&id=([0-9a-f-]{36})/i);
        const postId = bulletinMatch?.[1] || sectionMatch?.[1];
        if (!postId) return null;
        const commentMatch = n.link.match(/[?&]comment=([0-9a-f-]{36})/i);
        return {
          id: n.id,
          postId,
          commentId: commentMatch?.[1] ?? null,
          source: commentMatch?.[1] ? "comment" : "post",
          type: n.type,
        };
      }).filter(Boolean) as BulletinMentionNotification[];
    },
    refetchInterval: 30000,
  });

  // Map of postId -> mention notifications for that post
  const bulletinMentionsByPost = useMemo(() => {
    const map = new Map<string, BulletinMentionNotification[]>();
    for (const m of bulletinMentions) {
      const existing = map.get(m.postId) || [];
      existing.push(m);
      map.set(m.postId, existing);
    }
    return map;
  }, [bulletinMentions]);

  const { data: mentionNotifications = [] } = useQuery({
    queryKey: ["home-unreads-mentions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, link")
        .eq("user_id", user!.id)
        .eq("is_read", false)
        .eq("type", "photo_mention");
      if (error) throw error;
      return sanitizePhotoNotificationLinks(data ?? []);
    },
    refetchInterval: 30000,
  });

  const unreadMentionPhotoIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of mentionNotifications) {
      ids.add(n.photoId);
    }
    return ids;
  }, [mentionNotifications]);

  const mentionMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of mentionNotifications) {
      map[n.photoId] = (map[n.photoId] || 0) + 1;
    }
    return map;
  }, [mentionNotifications]);

  const homeBadgeCount = unreadBulletins.length + unreadMentionPhotoIds.size + bulletinMentions.length;

  return {
    unreadBulletins,
    unreadMentionPhotoIds,
    mentionMap,
    homeBadgeCount,
    bulletinMentions,
    bulletinMentionsByPost,
  };
}
