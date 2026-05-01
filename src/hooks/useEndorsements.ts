import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export type EndorsementStatus = "draft" | "open" | "acknowledged" | "in_progress" | "closed" | "cancelled";

export type EndorsementRecipient = {
  id: string;
  endorsement_id: string;
  recipient_user_id: string;
  status: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  notes: string | null;
  last_updated_at: string | null;
  created_at: string;
  recipient?: { full_name: string | null; email: string | null };
};

export type Endorsement = {
  id: string;
  leave_request_id: string;
  employee_user_id: string;
  department_id: string | null;
  leave_type: string;
  leave_start_date: string;
  leave_end_date: string;
  return_date: string | null;
  manager_user_id: string | null;
  urgency_level: "normal" | "high" | "critical";
  risk_notes: string | null;
  pending_issues: string | null;
  time_sensitive_deadlines: string | null;
  important_warnings: string | null;
  status: EndorsementStatus;
  system_generated: boolean;
  submitted_at: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  control_number: string | null;
  employee?: { full_name: string | null; email: string | null };
  manager?: { full_name: string | null; email: string | null };
  department?: { name: string; code: string } | null;
};

export type EndorsementItem = {
  id: string;
  endorsement_id: string;
  sort_order: number;
  client_name: string | null;
  task_name: string;
  task_type: string;
  task_details: string;
  next_steps: string | null;
  endorsed_to_user_id: string | null;
  due_date: string | null;
  frequency: string | null;
  priority: string;
  backup_notes: string | null;
  reference_links: any;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  task_status: string;
  endorsed_to?: { full_name: string | null; email: string | null };
};

export type EndorsementReference = {
  id: string;
  endorsement_id: string;
  tool_name: string;
  url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const ENDORSEMENT_SELECT = `
  *,
  employee:profiles!leave_endorsements_employee_user_id_fkey(full_name, email),
  manager:profiles!leave_endorsements_manager_user_id_fkey(full_name, email),
  department:departments(name, code)
`;

export function useMyEndorsements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["endorsements", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const uid = user!.id;

      // Fetch endorsements where user is employee
      const { data: ownEndorsements, error: ownErr } = await supabase
        .from("leave_endorsements")
        .select(ENDORSEMENT_SELECT)
        .eq("employee_user_id", uid)
        .order("created_at", { ascending: false });
      if (ownErr) throw ownErr;

      // Fetch endorsements where user is a recipient
      const { data: recipientRows, error: recErr } = await supabase
        .from("leave_endorsement_recipients")
        .select("endorsement_id")
        .eq("recipient_user_id", uid);
      if (recErr) throw recErr;

      // Fetch endorsements where user is an item assignee
      const { data: assigneeItems, error: assigneeErr } = await supabase
        .from("endorsement_item_assignees")
        .select("endorsement_item_id")
        .eq("user_id", uid);
      if (assigneeErr) throw assigneeErr;

      let assignedEndorsementIds: string[] = [];
      if (assigneeItems && assigneeItems.length > 0) {
        const { data: itemRows, error: itemErr } = await supabase
          .from("leave_endorsement_items")
          .select("endorsement_id")
          .in("id", assigneeItems.map((a) => a.endorsement_item_id));
        if (itemErr) throw itemErr;
        assignedEndorsementIds = (itemRows || []).map((r) => r.endorsement_id);
      }

      const recipientEndorsementIds = (recipientRows || []).map((r) => r.endorsement_id);
      const existingIds = new Set((ownEndorsements || []).map((e) => e.id));
      const missingIds = [...new Set([...recipientEndorsementIds, ...assignedEndorsementIds])].filter(
        (id) => !existingIds.has(id)
      );

      if (missingIds.length > 0) {
        const { data: extra, error: extraErr } = await supabase
          .from("leave_endorsements")
          .select(ENDORSEMENT_SELECT)
          .in("id", missingIds);
        if (extraErr) throw extraErr;
        if (extra) {
          return [...(ownEndorsements || []), ...extra] as unknown as Endorsement[];
        }
      }

      return (ownEndorsements || []) as unknown as Endorsement[];
    },
  });
}

export function useAllEndorsements(enabled: boolean) {
  return useQuery({
    queryKey: ["endorsements-all"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_endorsements")
        .select(ENDORSEMENT_SELECT)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Endorsement[];
    },
  });
}

export function useTeamEndorsements(enabled: boolean, managedDepartmentIds: string[]) {
  return useQuery({
    queryKey: ["endorsements-team", managedDepartmentIds],
    enabled: enabled && managedDepartmentIds.length > 0,
    queryFn: async () => {
      const { data: members, error: memErr } = await supabase
        .from("department_members")
        .select("user_id")
        .in("department_id", managedDepartmentIds);
      if (memErr) throw memErr;
      const memberIds = [...new Set((members || []).map((m) => m.user_id))];
      if (memberIds.length === 0) return [];

      const { data, error } = await supabase
        .from("leave_endorsements")
        .select(ENDORSEMENT_SELECT)
        .in("employee_user_id", memberIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Endorsement[];
    },
  });
}

export function useEndorsement(id: string | undefined) {
  return useQuery({
    queryKey: ["endorsement", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_endorsements")
        .select(`
          *,
          employee:profiles!leave_endorsements_employee_user_id_fkey(full_name, email),
          manager:profiles!leave_endorsements_manager_user_id_fkey(full_name, email),
          department:departments(name, code)
        `)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Endorsement | null;
    },
  });
}

export function useEndorsementRecipients(endorsementId: string | undefined) {
  return useQuery({
    queryKey: ["endorsement-recipients", endorsementId],
    enabled: !!endorsementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_endorsement_recipients")
        .select(`
          *,
          recipient:profiles!leave_endorsement_recipients_recipient_user_id_fkey(full_name, email)
        `)
        .eq("endorsement_id", endorsementId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EndorsementRecipient[];
    },
  });
}

export function useEndorsementItems(endorsementId: string | undefined) {
  return useQuery({
    queryKey: ["endorsement-items", endorsementId],
    enabled: !!endorsementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_endorsement_items")
        .select(`
          *,
          endorsed_to:profiles!leave_endorsement_items_endorsed_to_user_id_fkey(full_name, email)
        `)
        .eq("endorsement_id", endorsementId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EndorsementItem[];
    },
  });
}

export function useEndorsementReferences(endorsementId: string | undefined) {
  return useQuery({
    queryKey: ["endorsement-references", endorsementId],
    enabled: !!endorsementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_endorsement_references")
        .select("*")
        .eq("endorsement_id", endorsementId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EndorsementReference[];
    },
  });
}

export function useEndorsementBadge() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["endorsement-badge", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // 1. As employee: draft endorsements needing work (only active)
      const { count: draftCount } = await supabase
        .from("leave_endorsements")
        .select("*", { count: "exact", head: true })
        .eq("employee_user_id", user!.id)
        .eq("status", "draft");

      // 2. As recipient: pending acknowledgement on ACTIVE (open) endorsements only
      // Join through recipient rows to parent endorsement to exclude cancelled/closed
      const { data: pendingRows } = await supabase
        .from("leave_endorsement_recipients")
        .select("id, endorsement_id")
        .eq("recipient_user_id", user!.id)
        .eq("status", "pending");

      let pendingCount = 0;
      if (pendingRows && pendingRows.length > 0) {
        const endorsementIds = [...new Set(pendingRows.map((r) => r.endorsement_id))];
        const { count } = await supabase
          .from("leave_endorsements")
          .select("*", { count: "exact", head: true })
          .in("id", endorsementIds)
          .eq("status", "open");
        pendingCount = count || 0;
      }

      // 3. Unread endorsement notifications — only count if the linked endorsement still exists
      const { data: unreadNotifs } = await supabase
        .from("notifications")
        .select("id, link")
        .eq("user_id", user!.id)
        .in("type", ["endorsement_submitted", "endorsement_updated", "endorsement_acknowledged", "endorsement_task_updated", "endorsement_cancelled"])
        .eq("is_read", false);

      let notifCount = 0;
      if (unreadNotifs && unreadNotifs.length > 0) {
        // Extract endorsement IDs from deep links like /leave/endorsements/<uuid>
        const linkedIds = unreadNotifs
          .map((n) => n.link?.split("/").pop())
          .filter((id): id is string => !!id && id.length === 36);
        if (linkedIds.length > 0) {
          const uniqueIds = [...new Set(linkedIds)];
          const { count } = await supabase
            .from("leave_endorsements")
            .select("*", { count: "exact", head: true })
            .in("id", uniqueIds)
            .not("status", "in", '("cancelled","closed")');
          notifCount = count || 0;
        }
      }

      return (draftCount || 0) + pendingCount + notifCount;
    },
    refetchInterval: 30000,
  });
}

export function useDeleteEndorsement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leave_endorsements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["endorsements"] });
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
    },
  });
}

export function useSaveEndorsement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: Record<string, any> & { id: string }) => {
      const { id, ...rest } = updates;
      const { error } = await supabase
        .from("leave_endorsements")
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["endorsement", vars.id] });
      qc.invalidateQueries({ queryKey: ["endorsements"] });
      qc.invalidateQueries({ queryKey: ["endorsement-badge"] });
    },
  });
}

export type EndorsementUpdate = {
  id: string;
  endorsement_id: string;
  author_user_id: string;
  body: string;
  update_type: string;
  created_at: string;
  updated_at: string;
  author?: { full_name: string | null; email: string | null };
};

export function useEndorsementUpdates(endorsementId: string | undefined) {
  return useQuery({
    queryKey: ["endorsement-updates", endorsementId],
    enabled: !!endorsementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_endorsement_updates")
        .select(`
          *,
          author:profiles!leave_endorsement_updates_author_user_id_fkey(full_name, email)
        `)
        .eq("endorsement_id", endorsementId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as EndorsementUpdate[];
    },
  });
}

export function usePostEndorsementUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { endorsement_id: string; author_user_id: string; body: string; update_type?: string }) => {
      const { error } = await supabase
        .from("leave_endorsement_updates")
        .insert({
          endorsement_id: params.endorsement_id,
          author_user_id: params.author_user_id,
          body: params.body,
          update_type: params.update_type || "progress",
        });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["endorsement-updates", vars.endorsement_id] });
    },
  });
}
