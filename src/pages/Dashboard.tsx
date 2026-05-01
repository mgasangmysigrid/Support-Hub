import { supabase } from "@/integrations/supabase/client";
import { getBusinessTimeDiffMs } from "@/lib/sla-utils";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ListTodo, AlertTriangle, Clock, CheckCircle, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LucideIcon } from "lucide-react";
import DashboardLeaveOverview from "@/components/leave/DashboardLeaveOverview";

const StatCard = ({ icon: Icon, value, label, colorClass, textClass, to }: { icon: LucideIcon; value: number; label: string; colorClass?: string; textClass?: string; to: string }) => {
  const navigate = useNavigate();
  return (
    <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate(to)}>
      <CardContent className="flex items-center gap-4 pt-6">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorClass || "bg-primary/10"}`}>
          <Icon className={`h-5 w-5 ${textClass || "text-primary"}`} />
        </div>
        <div>
          <p className={`text-2xl font-bold ${textClass || ""}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
};

const StatCardSkeleton = () => (
  <Card>
    <CardContent className="flex items-center gap-4 pt-6">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-12" />
        <Skeleton className="h-3 w-20" />
      </div>
    </CardContent>
  </Card>
);

export default function Dashboard() {
  const { user, isSuperAdmin, isManager, managedDepartments } = useAuth();
  const navigate = useNavigate();

  // Get ticket IDs where user is assigned via ticket_assignees
  const { data: assignedTicketIds, isLoading: loadingAssignedIds } = useQuery({
    queryKey: ["dashboard-assigned-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_assignees")
        .select("ticket_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data?.map((r) => r.ticket_id) || [];
    },
  });

  const { data: assignedTickets, isLoading: loadingAssigned } = useQuery({
    queryKey: ["dashboard-assigned-tickets", user?.id, assignedTicketIds],
    enabled: !!user && !!assignedTicketIds && assignedTicketIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, status, priority, sla_due_at, sla_breached_at")
        .in("id", assignedTicketIds!)
        .neq("status", "closed");
      if (error) throw error;
      return data;
    },
  });

  const { data: submittedTickets, isLoading: loadingSubmitted } = useQuery({
    queryKey: ["dashboard-submitted-tickets", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, status, priority, sla_due_at, sla_breached_at")
        .eq("requester_id", user!.id)
        .neq("status", "closed");
      if (error) throw error;
      return data;
    },
  });

  const { data: assignedResolvedCount } = useQuery({
    queryKey: ["dashboard-assigned-resolved", user?.id, assignedTicketIds],
    enabled: !!user && !!assignedTicketIds && assignedTicketIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id")
        .in("id", assignedTicketIds!)
        .eq("status", "for_review");
      if (error) throw error;
      return data?.length || 0;
    },
  });

  const { data: submittedForReviewCount } = useQuery({
    queryKey: ["dashboard-submitted-for-review", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("requester_id", user!.id)
        .eq("status", "for_review");
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: deptTickets, isLoading: loadingDept } = useQuery({
    queryKey: ["dashboard-dept-tickets", managedDepartments, isSuperAdmin],
    enabled: !!user && (isManager || isSuperAdmin),
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select("id, status, priority, sla_due_at, sla_breached_at, department_id, departments(name)")
        .neq("status", "closed");
      if (!isSuperAdmin && managedDepartments.length > 0) {
        q = q.in("department_id", managedDepartments);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const assignedOpenTickets = assignedTickets?.filter((t) => t.status !== "for_review") || [];
  const assignedOpen = assignedOpenTickets.length;
  const assignedOverdue = assignedOpenTickets.filter((t) => getBusinessTimeDiffMs(new Date(), new Date(t.sla_due_at)) <= 0).length;
  const assignedCritical = assignedOpenTickets.filter((t) => t.priority === "critical").length;
  const assignedResolved = assignedResolvedCount || 0;

  const submittedOpenTickets = submittedTickets?.filter((t) => t.status !== "for_review") || [];
  const submittedOpen = submittedOpenTickets.length;
  const submittedOverdue = submittedOpenTickets.filter((t) => getBusinessTimeDiffMs(new Date(), new Date(t.sla_due_at)) <= 0).length;
  const submittedCritical = submittedOpenTickets.filter((t) => t.priority === "critical").length;
  const submittedForReview = submittedForReviewCount || 0;

  const deptOpen = deptTickets?.length || 0;
  const deptOverdue = deptTickets?.filter((t) => getBusinessTimeDiffMs(new Date(), new Date(t.sla_due_at)) <= 0).length || 0;
  const deptBreached = deptTickets?.filter((t) => t.sla_breached_at).length || 0;

  const isActionLoading = loadingAssignedIds || loadingAssigned;
  const isRequestsLoading = loadingSubmitted;
  const isDeptLoading = loadingDept;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Welcome back{user ? `, ${user.user_metadata?.full_name || ""}` : ""}</p>
        </div>
        <Link to="/tickets/create">
          <Button><Plus className="h-4 w-4 mr-2" /> New Ticket</Button>
        </Link>
      </div>

      {/* My Action Items */}
      <div>
        <h2 className="text-lg font-semibold mb-3">My Action Items</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isActionLoading ? (
            <>{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</>
          ) : (
            <>
              <StatCard icon={ListTodo} value={assignedOpen} label="Open Tickets" to="/tickets" />
              <StatCard icon={AlertTriangle} value={assignedCritical} label="Critical" colorClass="bg-red-100" textClass="text-red-600" to="/tickets" />
              <StatCard icon={Clock} value={assignedOverdue} label="Overdue" colorClass="bg-yellow-100" textClass="text-yellow-600" to="/tickets" />
              <StatCard icon={CheckCircle} value={assignedResolved} label="Resolved" colorClass="bg-green-100" textClass="text-green-600" to="/tickets" />
            </>
          )}
        </div>
      </div>

      {/* My Requests */}
      <div>
        <h2 className="text-lg font-semibold mb-3">My Requests</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {isRequestsLoading ? (
            <>{Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}</>
          ) : (
            <>
              <StatCard icon={ListTodo} value={submittedOpen} label="Open Tickets" to="/tickets?tab=submitted" />
              <StatCard icon={AlertTriangle} value={submittedCritical} label="Critical" colorClass="bg-red-100" textClass="text-red-600" to="/tickets?tab=submitted" />
              <StatCard icon={Clock} value={submittedOverdue} label="Overdue" colorClass="bg-yellow-100" textClass="text-yellow-600" to="/tickets?tab=submitted" />
              <StatCard icon={CheckCircle} value={submittedForReview} label="For Review" colorClass="bg-green-100" textClass="text-green-600" to="/tickets?tab=submitted" />
            </>
          )}
        </div>
      </div>

      {/* Department overview (manager/admin) */}
      {(isManager || isSuperAdmin) && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Department Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {isDeptLoading ? (
              <>{Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)}</>
            ) : (
              <>
                <StatCard icon={BarChart3} value={deptOpen} label="Open (Dept)" to="/department" />
                <StatCard icon={AlertTriangle} value={deptOverdue} label="Overdue (Dept)" colorClass="bg-yellow-100" textClass="text-yellow-600" to="/department" />
                <StatCard icon={Clock} value={deptBreached} label="SLA Breached" colorClass="bg-red-100" textClass="text-red-600" to="/department" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Leave Overview */}
      <DashboardLeaveOverview />

      {/* Quick links */}
      <div className="flex gap-3">
        <Link to="/tickets"><Button variant="outline" size="sm"><ListTodo className="h-4 w-4 mr-2" /> My Tickets</Button></Link>
        {(isManager || isSuperAdmin) && (
          <Link to="/department"><Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 mr-2" /> Department Queue</Button></Link>
        )}
      </div>
    </div>
  );
}
