import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export interface NotificationTarget {
  id: string;
  type: string;
  link: string | null;
}

export interface ResolvedNotificationTarget {
  href: string;
  isFallback: boolean;
  message?: string;
}

export function extractPhotoIdFromLink(link: string | null): string | null {
  if (!link) return null;

  const queryMatch = link.match(/photo=([0-9a-f-]{36})/i);
  if (queryMatch) return queryMatch[1];

  return UUID_RE.test(link) ? link : null;
}

export function extractTicketIdFromLink(link: string | null): string | null {
  if (!link) return null;
  return link.match(/^\/tickets\/([0-9a-f-]{36})/i)?.[1] ?? null;
}

export async function markNotificationsRead(ids: string[]) {
  if (ids.length === 0) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .eq("is_read", false);
}

export async function sanitizePhotoNotificationLinks<T extends { id: string; link: string | null }>(
  notifications: T[]
): Promise<Array<T & { photoId: string }>> {
  const parsed = notifications.map((notification) => ({
    ...notification,
    photoId: extractPhotoIdFromLink(notification.link),
  }));

  const candidateIds = [...new Set(parsed.map((item) => item.photoId).filter(Boolean))] as string[];
  const validPhotoIds = new Set<string>();

  if (candidateIds.length > 0) {
    const { data, error } = await supabase
      .from("user_photos")
      .select("id")
      .in("id", candidateIds);

    if (error) throw error;
    for (const photo of data ?? []) {
      validPhotoIds.add(photo.id);
    }
  }

  const valid = parsed.filter(
    (item): item is T & { photoId: string } => !!item.photoId && validPhotoIds.has(item.photoId)
  );
  const invalidIds = parsed
    .filter((item) => !item.photoId || !validPhotoIds.has(item.photoId))
    .map((item) => item.id);

  await markNotificationsRead(invalidIds);

  return valid;
}

export async function resolveNotificationTarget(notification: NotificationTarget): Promise<ResolvedNotificationTarget> {
  const photoId = extractPhotoIdFromLink(notification.link);
  if (photoId) {
    const { data, error } = await supabase
      .from("user_photos")
      .select("id")
      .eq("id", photoId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return { href: `/?photo=${photoId}`, isFallback: false };
    }

    return {
      href: "/",
      isFallback: true,
      message: "This activity is no longer available.",
    };
  }

  const ticketId = extractTicketIdFromLink(notification.link);
  if (ticketId) {
    const { data, error } = await supabase
      .from("tickets")
      .select("id")
      .eq("id", ticketId)
      .maybeSingle();

    if (error) throw error;

    if (data && notification.link) {
      return { href: notification.link, isFallback: false };
    }

    return {
      href: "/tickets",
      isFallback: true,
      message: "The original ticket is no longer available.",
    };
  }

  if (notification.link) {
    // Deep links to Home with bulletin section or bulletin param
    if (notification.link.startsWith("/home?") || notification.link.startsWith("/?")) {
      return { href: notification.link, isFallback: false };
    }
    if (
      notification.link === "/" ||
      notification.link === "/documents" ||
      notification.link === "/knowledge-base" ||
      notification.link === "/leave/my-leave" ||
      notification.link === "/leave/approvals" ||
      notification.link === "/tickets"
    ) {
      return { href: notification.link, isFallback: false };
    }
  }

  switch (notification.type) {
    case "bulletin_mention":
    case "bulletin_comment_mention":
      return { href: "/", isFallback: true, message: "The original post was removed." };
    case "photo_mention":
    case "featured_photo_created":
    case "featured_photo_reacted":
    case "featured_photo_tagged":
      return { href: "/", isFallback: true, message: "The original content was removed." };
    case "ticket_created":
    case "ticket_comment":
    case "ticket_activity":
    case "mention":
      return { href: "/tickets", isFallback: true, message: "The original ticket is no longer available." };
    case "leave_submitted":
      return { href: "/leave/approvals", isFallback: true, message: "This activity is no longer available." };
    case "leave_approved":
    case "leave_declined":
      return { href: "/leave/my-leave", isFallback: true, message: "This activity is no longer available." };
    case "document_issued":
    case "document_signature_request":
      return { href: "/documents", isFallback: true, message: "This activity is no longer available." };
    case "knowledge_base":
      return { href: "/knowledge-base", isFallback: true, message: "This activity is no longer available." };
    case "endorsement_submitted":
    case "endorsement_updated":
    case "endorsement_cancelled":
      return { href: "/leave/endorsements", isFallback: true, message: "This endorsement is no longer available." };
    default:
      return { href: "/notifications", isFallback: true, message: "This activity is no longer available." };
  }
}
