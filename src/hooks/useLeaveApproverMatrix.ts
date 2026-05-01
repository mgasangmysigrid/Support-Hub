import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ApprovalSettings {
  id: string;
  enabled: boolean;
  fallback_approver_id: string | null;
  default_approval_mode: string;
}

export interface ApproverGroup {
  id: string;
  name: string;
  description: string | null;
  approval_mode: string;
}

export interface ApproverOverride {
  id: string;
  employee_id: string;
  approval_mode: string;
}

export interface ResolvedApprover {
  approver_ids: string[];
  approval_mode: string;
  source: "individual_override" | "group" | "department" | "fallback" | "none";
  source_name?: string;
}

export function useApprovalSettings() {
  return useQuery<ApprovalSettings | null>({
    queryKey: ["leave-approval-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_approval_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as ApprovalSettings | null;
    },
  });
}

export function useApproverGroups() {
  return useQuery<ApproverGroup[]>({
    queryKey: ["leave-approver-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_approver_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data || []) as unknown as ApproverGroup[];
    },
  });
}

export function useGroupMembers(groupId?: string) {
  return useQuery({
    queryKey: ["leave-group-members", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_group_members")
        .select("*, profiles:user_id(id, full_name, email)")
        .eq("group_id", groupId!);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useGroupApprovers(groupId?: string) {
  return useQuery({
    queryKey: ["leave-group-approvers", groupId],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_group_approvers")
        .select("*, profiles:approver_id(id, full_name, email)")
        .eq("group_id", groupId!);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAllGroupMembers() {
  return useQuery({
    queryKey: ["all-leave-group-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_group_members")
        .select("*");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useAllGroupApprovers() {
  return useQuery({
    queryKey: ["all-leave-group-approvers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_group_approvers")
        .select("*, profiles:approver_id(id, full_name, email)")
        .eq("group_id", "group_id"); // This won't be used directly
      if (error) throw error;
      return data || [];
    },
  });
}

export function useApproverOverrides() {
  return useQuery({
    queryKey: ["leave-approver-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_approver_overrides")
        .select("*, profiles:employee_id(id, full_name, email)");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useOverrideApprovers(overrideId?: string) {
  return useQuery({
    queryKey: ["leave-override-approvers", overrideId],
    enabled: !!overrideId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_override_approvers")
        .select("*, profiles:approver_id(id, full_name, email)")
        .eq("override_id", overrideId!);
      if (error) throw error;
      return data || [];
    },
  });
}

/**
 * Resolve approvers for a given employee using the matrix priority:
 * 1. Individual override (highest)
 * 2. Group assignment
 * 3. Department manager (legacy fallback)
 * 4. Global fallback approver
 */
export async function resolveApproversForEmployee(
  employeeId: string,
  isManagerRole: boolean
): Promise<ResolvedApprover> {
  // 1. Check if matrix is enabled
  const { data: settings } = await supabase
    .from("leave_approval_settings")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (!settings || !(settings as any).enabled) {
    // Matrix disabled — use legacy logic
    return { approver_ids: [], approval_mode: "single", source: "none" };
  }

  const s = settings as any;

  // 2. Check individual override
  const { data: override } = await supabase
    .from("leave_approver_overrides")
    .select("id, approval_mode")
    .eq("employee_id", employeeId)
    .maybeSingle();

  if (override) {
    const { data: overrideApprovers } = await supabase
      .from("leave_override_approvers")
      .select("approver_id")
      .eq("override_id", (override as any).id);

    const ids = (overrideApprovers || []).map((a: any) => a.approver_id).filter(Boolean);
    if (ids.length > 0) {
      return {
        approver_ids: ids,
        approval_mode: (override as any).approval_mode,
        source: "individual_override",
      };
    }
  }

  // 3. Check group assignment
  const { data: groupMemberships } = await supabase
    .from("leave_group_members")
    .select("group_id, leave_approver_groups(id, name, approval_mode)")
    .eq("user_id", employeeId)
    .limit(1);

  if (groupMemberships && groupMemberships.length > 0) {
    const membership = groupMemberships[0] as any;
    const group = membership.leave_approver_groups;
    if (group) {
      const { data: groupApprovers } = await supabase
        .from("leave_group_approvers")
        .select("approver_id")
        .eq("group_id", group.id);

      const ids = (groupApprovers || []).map((a: any) => a.approver_id).filter(Boolean);
      if (ids.length > 0) {
        return {
          approver_ids: ids,
          approval_mode: group.approval_mode,
          source: "group",
          source_name: group.name,
        };
      }
    }
  }

  // 4. Department manager fallback
  const { data: deptMembership } = await supabase
    .from("department_members")
    .select("department_id")
    .eq("user_id", employeeId)
    .limit(1);

  if (deptMembership && deptMembership.length > 0) {
    const deptId = deptMembership[0].department_id;
    const { data: deptManager } = await supabase
      .from("department_members")
      .select("user_id")
      .eq("department_id", deptId)
      .eq("is_manager", true)
      .limit(1);

    if (deptManager && deptManager.length > 0 && deptManager[0].user_id !== employeeId) {
      return {
        approver_ids: [deptManager[0].user_id],
        approval_mode: s.default_approval_mode || "single",
        source: "department",
      };
    }
  }

  // 5. Global fallback
  if (s.fallback_approver_id) {
    return {
      approver_ids: [s.fallback_approver_id],
      approval_mode: "single",
      source: "fallback",
    };
  }

  return { approver_ids: [], approval_mode: "single", source: "none" };
}
