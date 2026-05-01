import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface LeaveOverviewFilters {
  departmentId: string | null;
  search: string;
  statusView: "all" | "pending_pto" | "approved_pto" | "approved_lwop" | "low_balance";
  dateFrom: string | null;
  dateTo: string | null;
}

export interface EmployeeLeaveRow {
  userId: string;
  fullName: string;
  email: string | null;
  departmentName: string;
  departmentId: string;
  approvedPtoHours: number;
  pendingPtoHours: number;
  approvedLwopHours: number;
  pendingLwopHours: number;
  currentPtoCredits: number;
  currentBirthdayCredits: number;
}

export interface LeaveOverviewSummary {
  totalEmployees: number;
  withPendingPto: number;
  withPendingLwop: number;
  totalApprovedPtoHours: number;
  totalApprovedLwopHours: number;
  withLowPtoBalance: number;
}

/** Low PTO threshold — employees below this are flagged. 2 working days = 16 hours. */
export const LOW_PTO_THRESHOLD_HOURS = 16;
export const LOW_PTO_THRESHOLD_DAYS = LOW_PTO_THRESHOLD_HOURS / 8;

/** Statuses considered "pending" (awaiting action). Draft is excluded as it hasn't been filed yet. */
const PENDING_STATUSES = ["submitted"];

export function useCanAccessLeaveOverview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["can-access-leave-overview", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [superRes, pcRes] = await Promise.all([
        supabase.rpc("is_super_admin", { _user_id: user!.id }),
        supabase.rpc("is_pc_member", { _user_id: user!.id }),
      ]);
      return !!(superRes.data || pcRes.data);
    },
  });
}

export function useLeaveOverview(filters: LeaveOverviewFilters) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["leave-overview", user?.id, filters],
    enabled: !!user,
    queryFn: async () => {
      // Verify access
      const [superRes, pcRes] = await Promise.all([
        supabase.rpc("is_super_admin", { _user_id: user!.id }),
        supabase.rpc("is_pc_member", { _user_id: user!.id }),
      ]);
      if (!superRes.data && !pcRes.data) return { rows: [], summary: emptySummary() };

      // Fetch all active profiles, department memberships, leave requests, PTO ledger
      const [profilesRes, deptMembersRes, deptsRes, leaveRes, ledgerRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, is_active").eq("is_active", true),
        supabase.from("department_members").select("user_id, department_id"),
        supabase.from("departments").select("id, name").order("display_order"),
        supabase.from("leave_requests").select("id, user_id, leave_type, status, date_from, date_to, total_hours, working_days_count"),
        supabase.from("pto_ledger").select("id, user_id, entry_type, hours, remaining_hours, expires_at"),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (deptMembersRes.error) throw deptMembersRes.error;
      if (deptsRes.error) throw deptsRes.error;
      if (leaveRes.error) throw leaveRes.error;
      if (ledgerRes.error) throw ledgerRes.error;

      const profiles = profilesRes.data || [];
      const deptMembers = deptMembersRes.data || [];
      const departments = deptsRes.data || [];
      const leaveRequests = leaveRes.data || [];
      const ledger = ledgerRes.data || [];

      const deptMap = new Map(departments.map(d => [d.id, d.name]));
      const userDeptMap = new Map<string, { deptId: string; deptName: string }>();
      for (const dm of deptMembers) {
        if (!userDeptMap.has(dm.user_id)) {
          userDeptMap.set(dm.user_id, {
            deptId: dm.department_id,
            deptName: deptMap.get(dm.department_id) || "Unknown",
          });
        }
      }

      // Compute PTO balances from ledger (live balance, not period-limited)
      // Uses remaining_hours for accruals (tracks deductions already allocated against each bucket)
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const d = String(now.getDate()).padStart(2, "0");
      const today = `${y}-${m}-${d}`;

      const userPtoBalances = new Map<string, number>();

      const ledgerByUser = new Map<string, typeof ledger>();
      for (const e of ledger) {
        if (!ledgerByUser.has(e.user_id)) ledgerByUser.set(e.user_id, []);
        ledgerByUser.get(e.user_id)!.push(e);
      }

      for (const [uid, entries] of ledgerByUser) {
        let balance = 0;
        for (const e of entries) {
          const hrs = Number(e.hours) || 0;
          const remHrs = Number(e.remaining_hours ?? e.hours) || 0;
          if (e.entry_type === "accrual") {
            // remaining_hours already reflects deductions allocated against this accrual
            const isExpired = e.expires_at && e.expires_at <= today;
            if (!isExpired) balance += remHrs;
          } else if (e.entry_type === "adjustment") {
            // Adjustments (e.g. historical imports) — use remaining_hours
            balance += remHrs;
          } else if (e.entry_type === "reversal") {
            // Reversals add back hours (from cancelled approved requests)
            balance += hrs;
          }
          // deduction entries: already subtracted via remaining_hours on accruals
          // expired entries: already excluded above
        }
        userPtoBalances.set(uid, Math.max(0, balance));
      }

      // Birthday leave: 1 day (8h) per calendar year
      // Reduce balance if pending (submitted) or approved birthday leave exists this year
      const userBdayBalances = new Map<string, number>();
      const yearStart = `${new Date().getFullYear()}-01-01`;
      for (const p of profiles) {
        const bdayUsedOrPending = leaveRequests.filter(
          lr => lr.user_id === p.id && lr.leave_type === "birthday_leave" &&
            lr.date_from >= yearStart &&
            (lr.status === "approved" || PENDING_STATUSES.includes(lr.status))
        );
        userBdayBalances.set(p.id, bdayUsedOrPending.length > 0 ? 0 : 8);
      }

      // Filter leave requests by date range for period metrics
      const dateFilteredLeave = leaveRequests.filter(lr => {
        if (filters.dateFrom && lr.date_to < filters.dateFrom) return false;
        if (filters.dateTo && lr.date_from > filters.dateTo) return false;
        return true;
      });

      // Build employee rows
      let rows: EmployeeLeaveRow[] = profiles.map(p => {
        const dept = userDeptMap.get(p.id);
        const userLeave = dateFilteredLeave.filter(lr => lr.user_id === p.id);

        const approvedPto = userLeave.filter(lr => lr.leave_type === "paid_pto" && lr.status === "approved");
        const pendingPto = userLeave.filter(lr => lr.leave_type === "paid_pto" && PENDING_STATUSES.includes(lr.status));
        const approvedLwop = userLeave.filter(lr => lr.leave_type === "unpaid_leave" && lr.status === "approved");
        const pendingLwop = userLeave.filter(lr => lr.leave_type === "unpaid_leave" && PENDING_STATUSES.includes(lr.status));

        return {
          userId: p.id,
          fullName: p.full_name || p.email || "Unknown",
          email: p.email,
          departmentName: dept?.deptName || "Unassigned",
          departmentId: dept?.deptId || "",
          approvedPtoHours: approvedPto.reduce((s, lr) => s + Number(lr.total_hours), 0),
          pendingPtoHours: pendingPto.reduce((s, lr) => s + Number(lr.total_hours), 0),
          approvedLwopHours: approvedLwop.reduce((s, lr) => s + Number(lr.total_hours), 0),
          pendingLwopHours: pendingLwop.reduce((s, lr) => s + Number(lr.total_hours), 0),
          currentPtoCredits: userPtoBalances.get(p.id) ?? 0,
          currentBirthdayCredits: userBdayBalances.get(p.id) ?? 8,
        };
      });

      // Apply department filter
      if (filters.departmentId) {
        rows = rows.filter(r => r.departmentId === filters.departmentId);
      }

      // Apply search
      if (filters.search.trim()) {
        const q = filters.search.toLowerCase();
        rows = rows.filter(r =>
          r.fullName.toLowerCase().includes(q) ||
          (r.email?.toLowerCase().includes(q))
        );
      }

      // Apply status view filter
      if (filters.statusView === "pending_pto") {
        rows = rows.filter(r => r.pendingPtoHours > 0);
      } else if (filters.statusView === "approved_pto") {
        rows = rows.filter(r => r.approvedPtoHours > 0);
      } else if (filters.statusView === "approved_lwop") {
        rows = rows.filter(r => r.approvedLwopHours > 0);
      } else if (filters.statusView === "low_balance") {
        rows = rows.filter(r => r.currentPtoCredits < LOW_PTO_THRESHOLD_HOURS);
      }

      // Summary
      const summary: LeaveOverviewSummary = {
        totalEmployees: rows.length,
        withPendingPto: rows.filter(r => r.pendingPtoHours > 0).length,
        withPendingLwop: rows.filter(r => r.pendingLwopHours > 0).length,
        totalApprovedPtoHours: rows.reduce((s, r) => s + r.approvedPtoHours, 0),
        totalApprovedLwopHours: rows.reduce((s, r) => s + r.approvedLwopHours, 0),
        withLowPtoBalance: rows.filter(r => r.currentPtoCredits < LOW_PTO_THRESHOLD_HOURS).length,
      };

      return { rows, summary, departments };
    },
  });
}

function emptySummary(): LeaveOverviewSummary {
  return { totalEmployees: 0, withPendingPto: 0, withPendingLwop: 0, totalApprovedPtoHours: 0, totalApprovedLwopHours: 0, withLowPtoBalance: 0 };
}
