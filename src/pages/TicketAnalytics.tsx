import { useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Lock } from "lucide-react";
import { useTicketAnalytics, type AnalyticsFilters } from "@/hooks/useTicketAnalytics";
import TicketAnalyticsFilters from "@/components/analytics/TicketAnalyticsFilters";
import TicketAnalyticsSummary from "@/components/analytics/TicketAnalyticsSummary";
import EmployeePerformanceTable from "@/components/analytics/EmployeePerformanceTable";
import DepartmentSummaryTable from "@/components/analytics/DepartmentSummaryTable";
import TicketAnalyticsCharts from "@/components/analytics/TicketAnalyticsCharts";

export default function TicketAnalytics() {
  const { profile, isSuperAdmin, isManager } = useAuth();
  const isBasicUser = !isSuperAdmin && !isManager;

  const [filters, setFilters] = useState<AnalyticsFilters>({
    dateFrom: null,
    dateTo: null,
    departmentId: null,
    employeeId: null,
    status: null,
    priority: null,
    slaStatus: null,
    dateMode: "created",
  });

  const updateFilters = (partial: Partial<AnalyticsFilters>) =>
    setFilters(prev => ({ ...prev, ...partial }));

  const {
    employeeMetrics, departmentMetrics, summaryMetrics, trendData,
    isLoading, visibleDepartments, visibleEmployees,
  } = useTicketAnalytics(filters);

  // Resolve basic user's department name for scope chip
  const userDeptName = useMemo(() => {
    if (!isBasicUser || !profile?.id) return null;
    const emp = employeeMetrics.find(e => e.userId === profile.id);
    return emp?.departmentName || null;
  }, [isBasicUser, profile, employeeMetrics]);

  const showDeptFilter = isSuperAdmin || isManager;
  const showEmployeeFilter = isSuperAdmin || isManager;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Ticket Performance Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin ? "Company-wide ticket performance" : isManager ? "Department ticket performance" : "Your ticket performance"}
          </p>
        </div>

        {/* Scope chips for basic users */}
        {isBasicUser && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1 text-xs">
              <Lock className="h-3 w-3" />
              {profile?.full_name || "You"}
            </Badge>
            {userDeptName && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Lock className="h-3 w-3" />
                {userDeptName}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <TicketAnalyticsFilters
        filters={filters}
        onChange={updateFilters}
        departments={visibleDepartments}
        employees={visibleEmployees}
        showDeptFilter={showDeptFilter}
        showEmployeeFilter={showEmployeeFilter}
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : (
        <>
          <TicketAnalyticsSummary metrics={summaryMetrics} />

          <Tabs defaultValue="employees" className="space-y-4">
            <TabsList>
              <TabsTrigger value="employees">By Employee</TabsTrigger>
              {showDeptFilter && <TabsTrigger value="departments">By Department</TabsTrigger>}
              <TabsTrigger value="trends">Trends</TabsTrigger>
            </TabsList>

            <TabsContent value="employees">
              <EmployeePerformanceTable data={employeeMetrics} filters={filters} />
            </TabsContent>

            {showDeptFilter && (
              <TabsContent value="departments">
                <DepartmentSummaryTable data={departmentMetrics} employeeMetrics={employeeMetrics} />
              </TabsContent>
            )}

            <TabsContent value="trends">
              <TicketAnalyticsCharts
                trendData={trendData}
                employeeMetrics={employeeMetrics}
                departmentMetrics={departmentMetrics}
                dateMode={filters.dateMode}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
