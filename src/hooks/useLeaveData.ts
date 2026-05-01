import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { LeaveRequest, PTOLedgerEntry, Schedule } from "@/lib/leave-utils";

export function useSchedule(scheduleId?: string | null) {
  return useQuery<Schedule>({
    queryKey: ["schedule", scheduleId],
    enabled: !!scheduleId || scheduleId === undefined,
    queryFn: async () => {
      if (scheduleId) {
        const { data, error } = await supabase.from("schedules").select("*").eq("id", scheduleId).single();
        if (error) throw error;
        return data as unknown as Schedule;
      }
      const { data, error } = await supabase.from("schedules").select("*").eq("is_default", true).single();
      if (error) throw error;
      return data as unknown as Schedule;
    },
  });
}

export function useDefaultSchedule() {
  return useQuery<Schedule>({
    queryKey: ["default-schedule"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedules").select("*").eq("is_default", true).single();
      if (error) throw error;
      return data as unknown as Schedule;
    },
  });
}

export function usePTOBalance(userId?: string) {
  return useQuery<{ available: number; pending: number; usedYTD: number; expired: number }>({
    queryKey: ["pto-balance", userId],
    enabled: !!userId,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const yearStart = `${new Date().getFullYear()}-01-01`;

      const { data: ledger, error } = await supabase
        .from("pto_ledger")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const entries = (ledger || []) as unknown as PTOLedgerEntry[];
      let available = 0;
      let usedYTD = 0;
      let expired = 0;
      let pending = 0;

      for (const e of entries) {
        const hrs = Number(e.hours) || 0;
        const remHrs = Number(e.remaining_hours ?? e.hours) || 0;
        if (e.entry_type === "accrual") {
          const isExpired = e.expires_at && e.expires_at <= today;
          if (isExpired) {
            expired += hrs;
          } else {
            available += remHrs;
          }
        } else if (e.entry_type === "deduction") {
          if (e.created_at >= yearStart) usedYTD += Math.abs(hrs);
        } else if (e.entry_type === "adjustment") {
          available += remHrs;
        } else if (e.entry_type === "reversal") {
          available += hrs;
        } else if (e.entry_type === "expired") {
          expired += Math.abs(hrs);
        }
      }

      // Calculate pending from pending paid requests
      const { data: pendingReqs } = await supabase
        .from("leave_requests")
        .select("total_hours")
        .eq("user_id", userId!)
        .eq("leave_type", "paid_pto")
        .eq("status", "submitted");
      pending = (pendingReqs || []).reduce((sum: number, r) => sum + Number(r.total_hours), 0);

      return { available: Math.max(0, available), pending, usedYTD, expired };
    },
  });
}

export function useMyLeaveRequests(userId?: string) {
  return useQuery<LeaveRequest[]>({
    queryKey: ["my-leave-requests", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LeaveRequest[];
    },
  });
}

export function usePTOLedger(userId?: string) {
  return useQuery<PTOLedgerEntry[]>({
    queryKey: ["pto-ledger", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pto_ledger")
        .select("*")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as PTOLedgerEntry[];
    },
  });
}

export function useApprovedLeavesForMonth(year: number, month: number) {
  return useQuery<(LeaveRequest & { profiles: { full_name: string | null; email: string | null } })[]>({
    queryKey: ["approved-leaves-calendar", year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("status", "approved")
        .lte("date_from", endDate)
        .gte("date_to", startDate);
      if (error) throw error;
      return (data || []) as unknown as (LeaveRequest & { profiles: { full_name: string | null; email: string | null } })[];
    },
  });
}

export function useCanSelfApprove(userId?: string) {
  return useQuery<boolean>({
    queryKey: ["can-self-approve", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_exemptions")
        .select("can_self_approve")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.can_self_approve === true;
    },
  });
}

export function usePendingApprovals() {
  const { user, isSuperAdmin } = useAuth();
  const { data: canSelfApprove } = useCanSelfApprove(user?.id);
  return useQuery<(LeaveRequest & { profiles: { full_name: string | null; email: string | null } })[]>({
    queryKey: ["pending-approvals", user?.id, canSelfApprove],
    enabled: !!user,
    queryFn: async () => {
      // Fetch all submitted requests — RLS will filter to what user can see
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("status", "submitted")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const all = (data || []) as unknown as (LeaveRequest & { profiles: { full_name: string | null; email: string | null }; approver_ids?: string[]; approver_id?: string | null; user_id: string })[];
      // Client-side filter: only show requests where current user is an assigned approver
      return all.filter((req) => {
        // Self-approve exemption: show own requests if user has can_self_approve
        if (req.user_id === user!.id && (canSelfApprove || isSuperAdmin)) {
          return true;
        }
        // If approver_ids is populated, use that
        if (req.approver_ids && req.approver_ids.length > 0) {
          return req.approver_ids.includes(user!.id);
        }
        // Legacy: use approver_id
        return req.approver_id === user!.id;
      });
    },
  });
}

export function useAllPendingApprovals() {
  const { user } = useAuth();
  return useQuery<(LeaveRequest & { profiles: { full_name: string | null; email: string | null } })[]>({
    queryKey: ["all-pending-approvals", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("status", "submitted")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as (LeaveRequest & { profiles: { full_name: string | null; email: string | null } })[];
    },
  });
}

export function useTodayLeaves() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery<(LeaveRequest & { profiles: { full_name: string | null; email: string | null } })[]>({
    queryKey: ["today-leaves", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("status", "approved")
        .lte("date_from", today)
        .gte("date_to", today);
      if (error) throw error;
      return (data || []) as unknown as (LeaveRequest & { profiles: { full_name: string | null; email: string | null } })[];
    },
  });
}

export function useUpcomingLeaves(userId?: string) {
  const today = new Date().toISOString().split("T")[0];
  return useQuery<LeaveRequest | null>({
    queryKey: ["upcoming-leave", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("user_id", userId!)
        .eq("status", "approved")
        .gte("date_from", today)
        .order("date_from", { ascending: true })
        .limit(1);
      if (error) throw error;
      return (data?.[0] as unknown as LeaveRequest) || null;
    },
  });
}

export function useUserProfile(userId?: string) {
  return useQuery({
    queryKey: ["user-profile-leave", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, start_date, accrual_start_date, schedule_id, probation_end_date, is_active, date_of_birth")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments-leave"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("departments")
        .select("id, name, max_out_per_day")
        .order("display_order");
      if (error) throw error;
      return data;
    },
  });
}

export function useUserDepartment(userId?: string) {
  return useQuery({
    queryKey: ["user-department", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("department_id, departments(id, name)")
        .eq("user_id", userId!)
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });
}

export function useDepartmentManager(deptId?: string) {
  return useQuery({
    queryKey: ["dept-manager-leave", deptId],
    enabled: !!deptId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("user_id, profiles(id, full_name, email)")
        .eq("department_id", deptId!)
        .eq("is_manager", true)
        .limit(1);
      if (error) throw error;
      return data?.[0] || null;
    },
  });
}

export function useLeaveExemption(userId?: string) {
  return useQuery({
    queryKey: ["leave-exemption", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_exemptions")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as { can_file_pto_anytime: boolean; allow_negative_pto_balance: boolean; notes: string | null } | null;
    },
  });
}
