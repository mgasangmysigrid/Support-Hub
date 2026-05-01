import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, CalendarDays, CalendarCheck } from "lucide-react";
import { useTodayLeaves, usePTOBalance, useUpcomingLeaves, usePendingApprovals } from "@/hooks/useLeaveData";
import { useAuth } from "@/hooks/useAuth";
import { formatHoursToDays } from "@/lib/leave-utils";
import { format } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { LucideIcon } from "lucide-react";

const LeaveStatCard = ({ icon: Icon, value, label, colorClass, to }: { icon: LucideIcon; value: string | number; label: string; colorClass: string; to: string }) => {
  const navigate = useNavigate();
  return (
    <Card className="cursor-pointer hover:border-teal-400/40 transition-colors" onClick={() => navigate(to)}>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default function DashboardLeaveOverview() {
  const { user, isManager, isSuperAdmin } = useAuth();
  const { data: todayLeaves, isLoading: loadingToday } = useTodayLeaves();
  const { data: balance, isLoading: loadingBalance } = usePTOBalance(user?.id);
  const { data: nextLeave } = useUpcomingLeaves(user?.id);
  const { data: pendingApprovals } = usePendingApprovals();

  const isLoading = loadingToday || loadingBalance;

  if (isLoading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-3">Leave Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-12 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-3">Leave Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <LeaveStatCard
          icon={Users}
          value={todayLeaves?.length || 0}
          label="Out Today"
          colorClass="bg-teal-100 text-teal-700"
          to="/leave/calendar"
        />
        {(isManager || isSuperAdmin) && (
          <LeaveStatCard
            icon={Clock}
            value={pendingApprovals?.length || 0}
            label="Pending Approvals"
            colorClass="bg-amber-100 text-amber-700"
            to="/leave/approvals"
          />
        )}
        <LeaveStatCard
          icon={CalendarDays}
          value={formatHoursToDays(balance?.available || 0)}
          label="My PTO Balance"
          colorClass="bg-blue-100 text-blue-700"
          to="/leave/my-leave"
        />
        <LeaveStatCard
          icon={CalendarCheck}
          value={nextLeave ? format(new Date(nextLeave.date_from), "MMM d") : "—"}
          label="Upcoming Leave"
          colorClass="bg-emerald-100 text-emerald-700"
          to="/leave/my-leave"
        />
      </div>
    </div>
  );
}
