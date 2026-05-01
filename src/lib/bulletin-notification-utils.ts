import { supabase } from "@/integrations/supabase/client";

/**
 * Create notifications for users mentioned in a bulletin post or comment.
 * Handles both @[Name](userId) mentions and @everyone.
 *
 * Link format: /?bulletin=<postId>&comment=<commentId> (comment is optional)
 * This enables deep-linking to the exact post and comment.
 */
export async function createBulletinMentionNotifications({
  postId,
  postTitle,
  actorId,
  mentionedUserIds,
  isEveryone,
  type = "bulletin_mention",
  commentId,
}: {
  postId: string;
  postTitle: string;
  actorId: string;
  mentionedUserIds: string[];
  isEveryone: boolean;
  type?: "bulletin_mention" | "bulletin_comment_mention";
  commentId?: string;
}) {
  // Build link with post and optional comment targeting
  let link = `/?bulletin=${postId}`;
  if (commentId) {
    link += `&comment=${commentId}`;
  }

  let recipientIds: string[] = [];

  if (isEveryone) {
    // Expand @everyone to all active users except actor
    const { data: activeUsers, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .neq("id", actorId);
    if (error) {
      console.error("[bulletin-notifications] Failed to fetch active users:", error.message);
      return;
    }
    recipientIds = (activeUsers || []).map((u) => u.id);
    console.log(`[bulletin-notifications] @everyone expanded to ${recipientIds.length} users for post ${postId}`);
  } else {
    // Individual mentions — exclude actor
    recipientIds = mentionedUserIds.filter((id) => id !== actorId);
  }

  if (recipientIds.length === 0) return;

  const titleText = type === "bulletin_comment_mention"
    ? "You were mentioned in a comment"
    : "You were mentioned in a post";
  const bodyText = postTitle.length > 80 ? postTitle.slice(0, 77) + "…" : postTitle;

  const notifications = recipientIds.map((userId) => ({
    user_id: userId,
    actor_id: actorId,
    type,
    title: titleText,
    body: bodyText,
    link,
  }));

  // Batch insert in chunks of 200 to avoid payload limits
  for (let i = 0; i < notifications.length; i += 200) {
    const chunk = notifications.slice(i, i + 200);
    const { error } = await supabase.from("notifications").insert(chunk);
    if (error) {
      console.error(`[bulletin-notifications] Failed to insert batch ${i}:`, error.message);
    }
  }

  console.log(`[bulletin-notifications] Created ${recipientIds.length} notifications (type: ${type}, commentId: ${commentId || "none"}) for post ${postId}`);
}
