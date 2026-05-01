import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { differenceInDays } from "date-fns";

export interface AnalyticsFilters {
  dateFrom: string | null;
  dateTo: string | null;
  departmentId: string | null;
  employeeId: string | null;
  status: string | null;
  priority: string | null;
  slaStatus: string | null;
  dateMode: "created" | "resolved";
}

export interface TicketRow {
  id: string;
  ticket_no: string;
  title: string;
  status: string;
  priority: string;
  created_at: string | null;
  closed_at: string | null;
  sla_due_at: string;
  sla_breached_at: string | null;
  first_response_at: string | null;
  reopened_count: number;
  primary_assignee_id: string | null;
  assignee_id: string | null;
  department_id: string;
}

export interface EmployeeMetrics {
  userId: string;
  fullName: string;
  departmentId: string;
  departmentName: string;
  ticketsProcessed: number;
  resolved: number;
  total: number;
  resolutionRate: number;
  slaMet: number;
  slaEligible: number;
  slaComplianceRate: number;
  avgResolutionHours: number;
  avgFirstResponseHours: number;
  openTickets: number;
  breachedTickets: number;
  reopenedTickets: number;
  tickets: TicketRow[];
}

export interface DepartmentMetrics {
  departmentId: string;
  departmentName: string;
  totalTickets: number;
  resolved: number;
  resolutionRate: number;
  slaMet: number;
  slaEligible: number;
  slaComplianceRate: number;
  avgResolutionHours: number;
  openTickets: number;
  breachedTickets: number;
}

export interface TrendPoint {
  date: string;
  label: string;
  count: number;
  resolved: number;
  slaMet: number;
  slaEligible: number;
}

const OPEN_STATUSES = ["open", "in_progress", "blocked", "for_review"];

function isResolved(status: string) {
  return status === "closed";
}

function isBreached(t: { sla_due_at: string; sla_breached_at: string | null }) {
  return !!t.sla_due_at && !!t.sla_breached_at;
}

function getTrendGrouping(dateFrom: string | null, dateTo: string | null): "daily" | "weekly" | "monthly" {
  if (!dateFrom || !dateTo) return "weekly";
  const days = differenceInDays(new Date(dateTo), new Date(dateFrom));
  if (days <= 7) return "daily";
  if (days <= 90) return "weekly";
  return "monthly";
}

function groupDate(dateStr: string, mode: "daily" | "weekly" | "monthly"): { key: string; label: string } {
  const date = new Date(dateStr + "T00:00:00");
  if (mode === "daily") {
    return { key: dateStr, label: dateStr };
  }
  if (mode === "weekly") {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    const key = d.toISOString().slice(0, 10);
    return { key, label: `Wk ${key.slice(5)}` };
  }
  const key = dateStr.slice(0, 7);
  return { key, label: key };
}

export function useTicketAnalytics(filters: AnalyticsFilters) {
  const { user, isSuperAdmin, isManager, managedDepartments } = useAuth();

  const { data: departments = [] } = useQuery({
    queryKey: ["analytics-departments"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name, code").order("display_order");
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["analytics-profiles"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email, is_active");
      return data ?? [];
    },
  });

  const { data: deptMembers = [] } = useQuery({
    queryKey: ["analytics-dept-members"],
    queryFn: async () => {
      const { data } = await supabase.from("department_members").select("user_id, department_id");
      return data ?? [];
    },
  });

  const { data: rawTickets = [], isLoading } = useQuery({
    queryKey: ["analytics-tickets", filters.status, filters.priority],
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("id, primary_assignee_id, assignee_id, department_id, status, priority, created_at, closed_at, sla_due_at, sla_breached_at, first_response_at, reopened_count, merged_into_id, ticket_no, title")
        .is("merged_into_id", null);

      if (filters.status) q = q.eq("status", filters.status as any);
      if (filters.priority) q = q.eq("priority", filters.priority as any);

      const { data } = await q;
      return data ?? [];
    },
  });

  // Build user->dept lookup
  const userDeptMap = useMemo(() => {
    const m = new Map<string, string>();
    deptMembers.forEach(dm => {
      if (!m.has(dm.user_id)) m.set(dm.user_id, dm.department_id);
    });
    return m;
  }, [deptMembers]);

  const computed = useMemo(() => {
    if (!user) return { employeeMetrics: [], departmentMetrics: [], summaryMetrics: null, trendData: [] };

    const deptMap = new Map(departments.map(d => [d.id, d.name]));
    const profileMap = new Map(profiles.map(p => [p.id, p.full_name || p.email || "Unknown"]));

    // Date filter
    let tickets = rawTickets.filter(t => {
      if (filters.dateMode === "resolved") {
        if (!t.closed_at) return false;
        const d = t.closed_at.slice(0, 10);
        if (filters.dateFrom && d < filters.dateFrom) return false;
        if (filters.dateTo && d > filters.dateTo) return false;
        return true;
      }
      const dateField = t.created_at;
      if (!dateField) return false;
      const d = dateField.slice(0, 10);
      if (filters.dateFrom && d < filters.dateFrom) return false;
      if (filters.dateTo && d > filters.dateTo) return false;
      return true;
    });

    // Department filter — use primary assignee's department, fallback to ticket.department_id
    if (filters.departmentId) {
      tickets = tickets.filter(t => {
        const owner = t.primary_assignee_id || t.assignee_id;
        const ownerDept = owner ? userDeptMap.get(owner) : null;
        return (ownerDept || t.department_id) === filters.departmentId;
      });
    }

    // Employee filter
    if (filters.employeeId) {
      tickets = tickets.filter(t => (t.primary_assignee_id || t.assignee_id) === filters.employeeId);
    }

    // SLA status filter
    if (filters.slaStatus === "met") {
      tickets = tickets.filter(t => t.sla_due_at && !t.sla_breached_at);
    } else if (filters.slaStatus === "breached") {
      tickets = tickets.filter(t => isBreached(t));
    } else if (filters.slaStatus === "no_sla") {
      tickets = tickets.filter(t => !t.sla_due_at);
    }

    // Role-based visibility — managers check owner's department
    let visibleTickets = tickets;
    if (!isSuperAdmin && !isManager) {
      visibleTickets = tickets.filter(t => (t.primary_assignee_id || t.assignee_id) === user.id);
    } else if (isManager && !isSuperAdmin) {
      visibleTickets = tickets.filter(t => {
        const ownerId = t.primary_assignee_id || t.assignee_id;
        if (ownerId === user.id) return true;
        if (ownerId) {
          const ownerDept = userDeptMap.get(ownerId);
          if (ownerDept && managedDepartments.includes(ownerDept)) return true;
        }
        if (managedDepartments.includes(t.department_id)) return true;
        return false;
      });
    }

    // Helper to compute metrics from a list of tickets
    function computeMetrics(tix: typeof visibleTickets) {
      const resolved = tix.filter(t => isResolved(t.status)).length;
      const slaEligible = tix.filter(t => !!t.sla_due_at).length;
      const slaMet = tix.filter(t => t.sla_due_at && !t.sla_breached_at && isResolved(t.status)).length;
      const openTix = tix.filter(t => OPEN_STATUSES.includes(t.status)).length;
      const breached = tix.filter(t => isBreached(t)).length;
      const reopened = tix.filter(t => t.reopened_count > 0).length;

      const resTimes = tix
        .filter(t => t.closed_at && t.created_at)
        .map(t => (new Date(t.closed_at!).getTime() - new Date(t.created_at!).getTime()) / 3600000);
      const avgRes = resTimes.length ? resTimes.reduce((a, b) => a + b, 0) / resTimes.length : 0;

      const frTimes = tix
        .filter(t => t.first_response_at && t.created_at)
        .map(t => (new Date(t.first_response_at!).getTime() - new Date(t.created_at!).getTime()) / 3600000);
      const avgFR = frTimes.length ? frTimes.reduce((a, b) => a + b, 0) / frTimes.length : 0;

      return { resolved, slaEligible, slaMet, openTickets: openTix, breached, reopened, avgRes, avgFR };
    }

    // Employee metrics
    const employeeTicketsMap = new Map<string, typeof visibleTickets>();
    visibleTickets.forEach(t => {
      const owner = t.primary_assignee_id || t.assignee_id;
      if (!owner) return;
      if (!employeeTicketsMap.has(owner)) employeeTicketsMap.set(owner, []);
      employeeTicketsMap.get(owner)!.push(t);
    });

    const employeeMetrics: EmployeeMetrics[] = [];
    employeeTicketsMap.forEach((tix, userId) => {
      const m = computeMetrics(tix);
      const deptId = userDeptMap.get(userId) || tix[0]?.department_id || "";

      employeeMetrics.push({
        userId,
        fullName: profileMap.get(userId) || "Unknown",
        departmentId: deptId,
        departmentName: deptMap.get(deptId) || "Unknown",
        ticketsProcessed: tix.length,
        resolved: m.resolved,
        total: tix.length,
        resolutionRate: tix.length ? (m.resolved / tix.length) * 100 : 0,
        slaMet: m.slaMet,
        slaEligible: m.slaEligible,
        slaComplianceRate: m.slaEligible ? (m.slaMet / m.slaEligible) * 100 : 0,
        avgResolutionHours: m.avgRes,
        avgFirstResponseHours: m.avgFR,
        openTickets: m.openTickets,
        breachedTickets: m.breached,
        reopenedTickets: m.reopened,
        tickets: tix as TicketRow[],
      });
    });

    // Department metrics — group by owner's department, fallback to ticket.department_id
    const deptTicketsMap = new Map<string, typeof visibleTickets>();
    visibleTickets.forEach(t => {
      const owner = t.primary_assignee_id || t.assignee_id;
      const deptId = owner ? (userDeptMap.get(owner) || t.department_id) : t.department_id;
      if (!deptTicketsMap.has(deptId)) deptTicketsMap.set(deptId, []);
      deptTicketsMap.get(deptId)!.push(t);
    });

    const departmentMetrics: DepartmentMetrics[] = [];
    deptTicketsMap.forEach((tix, deptId) => {
      const m = computeMetrics(tix);
      departmentMetrics.push({
        departmentId: deptId,
        departmentName: deptMap.get(deptId) || "Unknown",
        totalTickets: tix.length,
        resolved: m.resolved,
        resolutionRate: tix.length ? (m.resolved / tix.length) * 100 : 0,
        slaMet: m.slaMet,
        slaEligible: m.slaEligible,
        slaComplianceRate: m.slaEligible ? (m.slaMet / m.slaEligible) * 100 : 0,
        avgResolutionHours: m.avgRes,
        openTickets: m.openTickets,
        breachedTickets: m.breached,
      });
    });

    // Summary
    const sm = computeMetrics(visibleTickets);
    const summaryMetrics = {
      totalTickets: visibleTickets.length,
      resolved: sm.resolved,
      resolutionRate: visibleTickets.length ? (sm.resolved / visibleTickets.length) * 100 : 0,
      slaComplianceRate: sm.slaEligible ? (sm.slaMet / sm.slaEligible) * 100 : 0,
      avgResolutionHours: sm.avgRes,
      openTickets: sm.openTickets,
      breachedTickets: sm.breached,
      isResolvedMode: filters.dateMode === "resolved",
    };

    // Trend data — respect dateMode for trend date source
    const grouping = getTrendGrouping(filters.dateFrom, filters.dateTo);
    const trendMap = new Map<string, TrendPoint>();
    visibleTickets.forEach(t => {
      const rawDate = filters.dateMode === "resolved" ? t.closed_at : t.created_at;
      const d = (rawDate || "").slice(0, 10);
      if (!d) return;
      const { key, label } = groupDate(d, grouping);
      if (!trendMap.has(key)) {
        trendMap.set(key, { date: key, label, count: 0, resolved: 0, slaMet: 0, slaEligible: 0 });
      }
      const point = trendMap.get(key)!;
      point.count++;
      if (isResolved(t.status)) point.resolved++;
      if (t.sla_due_at) {
        point.slaEligible++;
        if (!t.sla_breached_at && isResolved(t.status)) point.slaMet++;
      }
    });

    const trendData = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    return { employeeMetrics, departmentMetrics, summaryMetrics, trendData };
  }, [rawTickets, departments, profiles, userDeptMap, filters, user, isSuperAdmin, isManager, managedDepartments]);

  const visibleDepartments = useMemo(() => {
    if (isSuperAdmin) return departments;
    if (isManager) return departments.filter(d => managedDepartments.includes(d.id));
    return [];
  }, [departments, isSuperAdmin, isManager, managedDepartments]);

  const visibleEmployees = useMemo(() => {
    if (isSuperAdmin) return profiles.filter(p => p.is_active);
    if (isManager) {
      const memberIds = new Set(deptMembers.filter(dm => managedDepartments.includes(dm.department_id)).map(dm => dm.user_id));
      // Include the manager themselves
      if (user) memberIds.add(user.id);
      return profiles.filter(p => p.is_active && memberIds.has(p.id));
    }
    return [];
  }, [profiles, deptMembers, isSuperAdmin, isManager, managedDepartments, user]);

  return {
    ...computed,
    isLoading,
    visibleDepartments,
    visibleEmployees,
  };
}
