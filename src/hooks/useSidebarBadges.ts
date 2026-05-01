import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useHomeUnreads } from "@/hooks/useHomeUnreads";

export function useSidebarBadges() {
  const { user, isManager, isSuperAdmin } = useAuth();
  const { homeBadgeCount } = useHomeUnreads();

  // PC member check for Leave Overview access
  const { data: isPcMember = false } = useQuery({
    queryKey: ["sidebar-is-pc-member", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.rpc("is_pc_member", { _user_id: user!.id });
      return !!data;
    },
    staleTime: 60000,
  });

  // Department Queue: unassigned tickets, not closed
  const { data: deptQueueCount = 0 } = useQuery({
    queryKey: ["sidebar-badge-dept-queue", user?.id],
    enabled: !!user && (isManager || isSuperAdmin),
    queryFn: async () => {
      const { count } = await supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .is("assignee_id", null)
        .neq("status", "closed");
      return count || 0;
    },
    refetchInterval: 30000,
  });

  // Approvals: pending leave requests for manager
  const { data: approvalsCount = 0 } = useQuery({
    queryKey: ["sidebar-badge-approvals", user?.id],
    enabled: !!user && (isManager || isSuperAdmin),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, approver_ids, approver_id")
        .eq("status", "submitted");
      if (error) return 0;
      return (data || []).filter((req: any) => {
        if (req.approver_ids && req.approver_ids.length > 0) {
          return req.approver_ids.includes(user!.id);
        }
        return req.approver_id === user!.id;
      }).length;
    },
    refetchInterval: 30000,
  });

  // My Leave: unread leave-related notifications
  const { data: leaveUnreadCount = 0 } = useQuery({
    queryKey: ["sidebar-badge-my-leave", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_read", false)
        .in("type", ["leave_submitted", "leave_approved", "leave_declined"]);
      return count || 0;
    },
    refetchInterval: 30000,
  });

  // My Documents: pending signature count
  const { data: documentsActionCount = 0 } = useQuery({
    queryKey: ["sidebar-badge-documents", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("document_signers")
        .select("*", { count: "exact", head: true })
        .eq("signer_user_id", user!.id)
        .eq("status", "pending");
      return count || 0;
    },
    refetchInterval: 30000,
  });

  // Profile completion: count incomplete key fields
  const { data: profileIncomplete = 0 } = useQuery({
    queryKey: ["sidebar-badge-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("profile_photo_url, mobile_number, emergency_contact_name, emergency_contact_number, current_address, email")
        .eq("id", user!.id)
        .maybeSingle();
      if (!data) return 0;
      const fields = [
        data.profile_photo_url,
        data.mobile_number,
        data.emergency_contact_name,
        data.emergency_contact_number,
        data.current_address,
        data.email,
      ];
      const missing = fields.filter((f) => !f || (typeof f === "string" && !f.trim())).length;
      return missing > 0 ? missing : 0;
    },
    refetchInterval: 60000,
  });

  const showLeaveOverview = isSuperAdmin || isPcMember;

  return { deptQueueCount, approvalsCount, leaveUnreadCount, profileIncomplete, documentsActionCount, homeBadgeCount, showLeaveOverview };
}
