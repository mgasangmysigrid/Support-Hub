import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarDays, Clock, Activity } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, addDays } from "date-fns";
import { getLeaveTypeLabel } from "@/lib/leave-utils";
import type { LeaveRequest } from "@/lib/leave-utils";
import { Skeleton } from "@/components/ui/skeleton";

type LeaveWithProfile = LeaveRequest & { profiles: { full_name: string | null; email: string | null } };

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function getLeaveTypeColor(type: string) {
  if (type === "paid_pto") return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0";
  if (type === "unpaid_leave") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0";
  return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-0";
}

export default function LeaveQuickInsights() {
  const today = format(new Date(), "yyyy-MM-dd");
  const next7Days = format(addDays(new Date(), 7), "yyyy-MM-dd");

  const { data: todayLeaves, isLoading: loadingToday } = useQuery<LeaveWithProfile[]>({
    queryKey: ["leave-insights-today", today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("status", "approved")
        .lte("date_from", today)
        .gte("date_to", today);
      if (error) throw error;
      return (data || []) as unknown as LeaveWithProfile[];
    },
  });

  const { data: upcomingLeaves, isLoading: loadingUpcoming } = useQuery<LeaveWithProfile[]>({
    queryKey: ["leave-insights-upcoming", today, next7Days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .eq("status", "approved")
        .gt("date_from", today)
        .lte("date_from", next7Days)
        .order("date_from", { ascending: true })
        .limit(8);
      if (error) throw error;
      return (data || []) as unknown as LeaveWithProfile[];
    },
  });

  const { data: recentActivity, isLoading: loadingRecent } = useQuery<LeaveWithProfile[]>({
    queryKey: ["leave-insights-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("*, profiles!leave_requests_user_id_fkey(full_name, email)")
        .in("status", ["approved", "submitted"])
        .order("updated_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data || []) as unknown as LeaveWithProfile[];
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Today's Leave Snapshot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <CalendarDays className="h-4 w-4" /> Today's Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingToday ? (
            <Skeleton className="h-16 w-full" />
          ) : !todayLeaves?.length ? (
            <p className="text-sm text-muted-foreground/60 py-3">No one is on leave today</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {todayLeaves.map((leave) => (
                <div key={leave.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                      {getInitials(leave.profiles?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{leave.profiles?.full_name?.split(" ")[0] || "Employee"}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {leave.leave_type === "unpaid_leave" ? "LWOP" : "PTO"}
                      {leave.duration_type !== "full_day" && ` · ${leave.duration_type === "half_day_am" ? "AM" : "PM"}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Next 7 Days */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <Clock className="h-4 w-4" /> Next 7 Days
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingUpcoming ? (
            <Skeleton className="h-16 w-full" />
          ) : !upcomingLeaves?.length ? (
            <p className="text-sm text-muted-foreground/60 py-3">No upcoming leave scheduled</p>
          ) : (
            <div className="space-y-2">
              {upcomingLeaves.slice(0, 4).map((leave) => (
                <div key={leave.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        {getInitials(leave.profiles?.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium truncate">{leave.profiles?.full_name?.split(" ")[0]}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {format(new Date(leave.date_from), "MMM d")}
                  </span>
                </div>
              ))}
              {upcomingLeaves.length > 4 && (
                <p className="text-[10px] text-muted-foreground">+{upcomingLeaves.length - 4} more</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingRecent ? (
            <Skeleton className="h-16 w-full" />
          ) : !recentActivity?.length ? (
            <p className="text-sm text-muted-foreground/60 py-3">No recent leave activity</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.slice(0, 4).map((leave) => (
                <div key={leave.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${leave.status === "approved" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="text-xs truncate">
                      {leave.profiles?.full_name?.split(" ")[0]} · {leave.leave_type === "unpaid_leave" ? "LWOP" : "PTO"}
                    </span>
                  </div>
                  <Badge variant="outline" className={`text-[9px] h-4 px-1.5 shrink-0 ${leave.status === "approved" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border-0" : "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border-0"}`}>
                    {leave.status === "approved" ? "Approved" : "Pending"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
