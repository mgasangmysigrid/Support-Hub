import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, CalendarDays, CalendarOff, CalendarCheck, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfMonth, endOfMonth, addDays } from "date-fns";
import type { LucideIcon } from "lucide-react";

interface DashboardCard {
  icon: LucideIcon;
  value: string | number;
  label: string;
  sublabel?: string;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
}

function StatCard({ icon: Icon, value, label, sublabel, iconBg, iconColor, onClick }: DashboardCard) {
  return (
    <Card
      className={`group transition-all duration-200 hover:shadow-md ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sublabel}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

interface Props {
  onFilterChange?: (filter: { status?: string; leaveType?: string }) => void;
}

export default function LeaveExecutiveDashboard({ onFilterChange }: Props) {
  const { isManager, isSuperAdmin } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const next14Days = format(addDays(new Date(), 14), "yyyy-MM-dd");

  const { data, isLoading } = useQuery({
    queryKey: ["leave-executive-dashboard", today, monthStart],
    queryFn: async () => {
      const [todayRes, pendingRes, upcomingRes, lwopRes, approvedMonthRes] = await Promise.all([
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .lte("date_from", today)
          .gte("date_to", today),
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "submitted"),
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .eq("leave_type", "paid_pto")
          .gt("date_from", today)
          .lte("date_from", next14Days),
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("leave_type", "unpaid_leave")
          .in("status", ["approved", "submitted"])
          .gte("date_from", monthStart)
          .lte("date_from", monthEnd),
        supabase
          .from("leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "approved")
          .gte("date_from", monthStart)
          .lte("date_from", monthEnd),
      ]);

      return {
        onLeaveToday: todayRes.count || 0,
        pendingRequests: pendingRes.count || 0,
        upcomingPTO: upcomingRes.count || 0,
        lwopThisMonth: lwopRes.count || 0,
        approvedThisMonth: approvedMonthRes.count || 0,
      };
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-14 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const cards: DashboardCard[] = [
    {
      icon: Users,
      value: data?.onLeaveToday || 0,
      label: "On Leave Today",
      sublabel: `${data?.onLeaveToday === 1 ? "1 employee" : `${data?.onLeaveToday || 0} employees`}`,
      iconBg: "bg-sky-50 dark:bg-sky-950/40",
      iconColor: "text-sky-600 dark:text-sky-400",
    },
    {
      icon: Clock,
      value: data?.pendingRequests || 0,
      label: "Pending Requests",
      sublabel: "awaiting action",
      iconBg: "bg-amber-50 dark:bg-amber-950/40",
      iconColor: "text-amber-600 dark:text-amber-400",
      onClick: (isManager || isSuperAdmin) ? () => onFilterChange?.({ status: "submitted" }) : undefined,
    },
    {
      icon: CalendarDays,
      value: data?.upcomingPTO || 0,
      label: "Upcoming PTO",
      sublabel: "next 14 days",
      iconBg: "bg-blue-50 dark:bg-blue-950/40",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: CalendarOff,
      value: data?.lwopThisMonth || 0,
      label: "LWOP This Month",
      sublabel: `${data?.lwopThisMonth === 1 ? "1 entry" : `${data?.lwopThisMonth || 0} entries`} recorded`,
      iconBg: "bg-orange-50 dark:bg-orange-950/40",
      iconColor: "text-orange-600 dark:text-orange-400",
    },
    {
      icon: CalendarCheck,
      value: data?.approvedThisMonth || 0,
      label: "Approved This Month",
      sublabel: format(new Date(), "MMMM"),
      iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
      iconColor: "text-emerald-600 dark:text-emerald-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card, i) => (
        <StatCard key={i} {...card} />
      ))}
    </div>
  );
}
