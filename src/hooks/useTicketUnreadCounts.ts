import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TicketUnreadCounts {
  byTicket: Record<string, number>;
  ownedTotal: number;
  submittedTotal: number;
  collaboratingTotal: number;
  combinedTotal: number;
  isLoading: boolean;
}

export function useTicketUnreadCounts(): TicketUnreadCounts {
  const { user } = useAuth();

  const { data: notifications, isLoading: loadingNotifs } = useQuery({
    queryKey: ["ticket-unread-notifs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, link")
        .eq("user_id", user!.id)
        .eq("is_read", false)
        .like("link", "/tickets/%");
      if (error) throw error;

      const ticketIds = [...new Set((data || []).map((n) => n.link?.match(/^\/tickets\/([a-f0-9-]+)/i)?.[1]).filter(Boolean))] as string[];
      if (ticketIds.length === 0) return data || [];

      const { data: tickets, error: ticketsError } = await supabase
        .from("tickets")
        .select("id")
        .in("id", ticketIds);
      if (ticketsError) throw ticketsError;

      const validIds = new Set((tickets || []).map((ticket) => ticket.id));
      const validNotifications = (data || []).filter((notification) => {
        const ticketId = notification.link?.match(/^\/tickets\/([a-f0-9-]+)/i)?.[1];
        return !!ticketId && validIds.has(ticketId);
      });
      const invalidNotificationIds = (data || [])
        .filter((notification) => {
          const ticketId = notification.link?.match(/^\/tickets\/([a-f0-9-]+)/i)?.[1];
          return !ticketId || !validIds.has(ticketId);
        })
        .map((notification) => notification.id);

      if (invalidNotificationIds.length > 0) {
        await supabase.from("notifications").update({ is_read: true }).in("id", invalidNotificationIds).eq("is_read", false);
      }

      return validNotifications;
    },
    refetchInterval: 30000,
  });

  // Fetch tickets where user is primary_assignee (owner)
  const { data: ownedIds, isLoading: loadingOwned } = useQuery({
    queryKey: ["ticket-unread-owned-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id")
        .eq("primary_assignee_id", user!.id);
      if (error) throw error;
      return data?.map((r) => r.id) || [];
    },
  });

  // Fetch submitted ticket IDs
  const { data: submittedIds, isLoading: loadingSubmitted } = useQuery({
    queryKey: ["ticket-unread-submitted-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id")
        .eq("requester_id", user!.id);
      if (error) throw error;
      return data?.map((r) => r.id) || [];
    },
  });

  // Fetch collaborating ticket IDs
  const { data: collabIds, isLoading: loadingCollab } = useQuery({
    queryKey: ["ticket-unread-collab-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_collaborators")
        .select("ticket_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data?.map((r) => r.ticket_id) || [];
    },
  });

  const byTicket: Record<string, number> = {};
  if (notifications) {
    for (const n of notifications) {
      if (!n.link) continue;
      const match = n.link.match(/^\/tickets\/([a-f0-9-]+)/);
      if (match) {
        const ticketId = match[1];
        byTicket[ticketId] = (byTicket[ticketId] || 0) + 1;
      }
    }
  }

  const ownedSet = new Set(ownedIds || []);
  const submittedSet = new Set(submittedIds || []);
  const collabSet = new Set(collabIds || []);

  // Buckets are mutually exclusive in priority order:
  // Owner (Action Items) > Requester (Requests) > Collaborator (Collaborating).
  // This ensures "Collaborating" only reflects tickets where the user is
  // explicitly added as a collaborator AND is not already the owner/requester,
  // preventing double-counting and noise from passive department visibility.
  let ownedTotal = 0;
  let submittedTotal = 0;
  let collaboratingTotal = 0;
  for (const [ticketId, count] of Object.entries(byTicket)) {
    if (ownedSet.has(ticketId)) {
      ownedTotal += count;
    } else if (submittedSet.has(ticketId)) {
      submittedTotal += count;
    } else if (collabSet.has(ticketId)) {
      collaboratingTotal += count;
    }
    // Notifications for tickets where the user has no explicit role
    // (e.g. lingering dept-manager visibility) are intentionally excluded
    // from all three buckets to keep counts trustworthy.
  }

  return {
    byTicket,
    ownedTotal,
    submittedTotal,
    collaboratingTotal,
    combinedTotal: ownedTotal + submittedTotal + collaboratingTotal,
    isLoading: loadingNotifs || loadingOwned || loadingSubmitted || loadingCollab,
  };
}
