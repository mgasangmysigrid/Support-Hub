import { useState, useMemo } from "react";
import { startOfWeek, format, addDays } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDepartments } from "@/hooks/useLeaveData";
import type { LeaveRequest } from "@/lib/leave-utils";

import LeaveExecutiveDashboard from "@/components/leave/calendar/LeaveExecutiveDashboard";
import LeaveQuickInsights from "@/components/leave/calendar/LeaveQuickInsights";
import LeaveFilterBar from "@/components/leave/calendar/LeaveFilterBar";
import LeaveCalendarGrid from "@/components/leave/calendar/LeaveCalendarGrid";
import LeaveListView from "@/components/leave/calendar/LeaveListView";
import LeaveDetailPanel from "@/components/leave/calendar/LeaveDetailPanel";
import LeaveLegend from "@/components/leave/calendar/LeaveLegend";

type LeaveWithProfile = LeaveRequest & { profiles: { full_name: string | null; email: string | null } };

function useLeaveDepartments(userIds: string[]) {
  return useQuery({
    queryKey: ["leave-dept-map", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("department_members")
        .select("user_id, department_id, departments(name)")
        .in("user_id", userIds);
      const map = new Map<string, { department_id: string; department_name: string }>();
      for (const d of (data || []) as any[]) {
        map.set(d.user_id, { department_id: d.department_id, department_name: d.departments?.name || "Unknown" });
      }
      return map;
    },
  });
}

function useLeaveSchedules(userIds: string[]) {
  return useQuery({
    queryKey: ["leave-schedule-map", userIds.sort().join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, schedule_id, schedules(working_days)")
        .in("id", userIds);
      const map = new Map<string, number[]>();
      for (const p of (data || []) as any[]) {
        const wd = p.schedules?.working_days ?? [1, 2, 3, 4, 5]; // default Mon-Fri
        map.set(p.id, wd);
      }
      return map;
    },
  });
}

// Fetch all leaves for a month (not just approved - include pending too)
function useAllLeavesForMonth(year: number, month: number) {
  return useQuery<LeaveWithProfile[]>({
    queryKey: ["all-leaves-calendar", year, month],
    queryFn: async () => {
      const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .in("status", ["approved", "submitted"])
        .lte("date_from", endDate)
        .gte("date_to", startDate);
      if (error) throw error;
      return (data || []) as unknown as LeaveWithProfile[];
    },
  });
}

export default function LeaveCalendar() {
  const { user, isManager, isSuperAdmin } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 0 }));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedLeave, setSelectedLeave] = useState<LeaveWithProfile | null>(null);
  const [viewMode, setViewMode] = useState<"month" | "week" | "list">("month");
  const [filters, setFilters] = useState({
    search: "",
    leaveType: "all",
    status: "all",
    department: "all",
    onlyMine: false,
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const { data: allLeaves, isLoading } = useAllLeavesForMonth(year, month);
  const { data: departments } = useDepartments();

  const userIds = useMemo(() => {
    if (!allLeaves) return [];
    return [...new Set(allLeaves.map((l) => l.user_id))];
  }, [allLeaves]);

  const { data: deptMap } = useLeaveDepartments(userIds);
  const { data: scheduleMap } = useLeaveSchedules(userIds);

  const deptCapacity = useMemo(() => {
    const map = new Map<string, number>();
    departments?.forEach((d) => map.set(d.id, d.max_out_per_day));
    return map;
  }, [departments]);

  // Apply filters
  const filteredLeaves = useMemo(() => {
    if (!allLeaves) return [];
    return allLeaves.filter((l) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const name = (l.profiles?.full_name || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (filters.leaveType !== "all" && l.leave_type !== filters.leaveType) return false;
      if (filters.status !== "all" && l.status !== filters.status) return false;
      if (filters.department !== "all") {
        const dept = deptMap?.get(l.user_id);
        if (dept?.department_id !== filters.department) return false;
      }
      if (filters.onlyMine && l.user_id !== user?.id) return false;
      return true;
    });
  }, [allLeaves, filters, deptMap, user?.id]);

  const selectedDateLeaves = selectedDate
    ? filteredLeaves.filter((l) => {
        const selKey = format(selectedDate, "yyyy-MM-dd");
        return selKey >= l.date_from && selKey <= l.date_to;
      })
    : [];

  const handleToday = () => {
    setCurrentMonth(new Date());
    setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }));
  };

  const handleDashboardFilter = (filter: { status?: string; leaveType?: string }) => {
    setFilters((prev) => ({
      ...prev,
      status: filter.status || prev.status,
      leaveType: filter.leaveType || prev.leaveType,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Calendar</h1>
        <p className="text-sm text-muted-foreground">Leave management hub — monitor, plan, and track leave activity</p>
      </div>

      {/* Executive Dashboard */}
      <LeaveExecutiveDashboard onFilterChange={handleDashboardFilter} />

      {/* Quick Insights */}
      <LeaveQuickInsights />

      {/* Filter Bar */}
      <LeaveFilterBar
        filters={filters}
        onChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onToday={handleToday}
        departments={departments?.map((d) => ({ id: d.id, name: d.name }))}
      />

      {/* Legend */}
      <LeaveLegend />

      {/* Calendar / List */}
      {viewMode === "list" ? (
        <LeaveListView
          leaves={filteredLeaves}
          onSelectLeave={setSelectedLeave}
          deptMap={deptMap}
        />
      ) : (
        <LeaveCalendarGrid
          leaves={filteredLeaves}
          currentMonth={currentMonth}
          currentWeekStart={currentWeekStart}
          viewMode={viewMode}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onMonthChange={setCurrentMonth}
          onWeekChange={setCurrentWeekStart}
          deptMap={deptMap}
          deptCapacity={deptCapacity}
          scheduleMap={scheduleMap}
        />
      )}

      {/* Detail Panels */}
      <LeaveDetailPanel
        leave={selectedLeave}
        open={!!selectedLeave}
        onClose={() => setSelectedLeave(null)}
        canApprove={isManager || isSuperAdmin}
      />

      <LeaveDetailPanel
        leave={null}
        open={!!selectedDate && viewMode !== "list"}
        onClose={() => setSelectedDate(null)}
        dateLeaves={selectedDateLeaves}
        selectedDate={selectedDate}
        deptMap={deptMap}
        deptCapacity={deptCapacity}
      />
    </div>
  );
}
