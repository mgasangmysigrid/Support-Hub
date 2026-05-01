import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Activity, Users, UserX, AlertTriangle, TrendingUp, Clock, BarChart3, ChevronDown, Wifi } from "lucide-react";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  useAdoptionKPIs,
  useModuleUsage,
  useUserAdoptionTable,
  useAdoptionAlerts,
  type AdoptionFilters,
} from "@/hooks/use-adoption-analytics";
import AdoptionUserDrawer, { type MetricType } from "./AdoptionUserDrawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const DATE_PRESETS = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 14 Days", days: 14 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
];

const MODULE_LABELS: Record<string, string> = {
  home: "Home",
  dashboard: "Dashboard",
  tickets: "Tickets",
  leave: "Leave & PTO",
  endorsements: "Endorsements",
  documents: "Documents",
  knowledge_base: "Company Documents",
  profile: "Profile",
  directory: "Directory",
  admin: "Admin",
  updates: "Updates / Bulletin",
  notifications: "Notifications",
  analytics: "Analytics",
};

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "—";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${minutes}m`;
}

export default function AppAdoptionTab() {
  const [dateRange, setDateRange] = useState(30);
  const [app, setApp] = useState("support_hub");
  const [deptId, setDeptId] = useState("all");
  const [drawerMetric, setDrawerMetric] = useState<MetricType | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  const { data: departments } = useQuery({
    queryKey: ["departments-for-adoption"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name").order("name");
      return data || [];
    },
  });

  const filters: AdoptionFilters = useMemo(() => ({
    dateFrom: subDays(new Date(), dateRange),
    dateTo: new Date(),
    app,
    deptId,
  }), [dateRange, app, deptId]);

  const { data: kpis, isLoading: kpisLoading } = useAdoptionKPIs(filters);
  const { data: moduleUsage } = useModuleUsage(filters);
  const { data: userTable } = useUserAdoptionTable(filters);
  const { data: alerts } = useAdoptionAlerts();

  const openDrawer = (metric: MetricType) => setDrawerMetric(metric);

  const getAlertMetric = (alert: { type: string; message: string }): MetricType | null => {
    if (alert.type === "never_logged_in" || alert.message.toLowerCase().includes("never logged in")) return "never_logged_in";
    if (alert.type === "dormant" || alert.message.toLowerCase().includes("dormant")) return "dormant";
    return null;
  };

  // Currently active users: last active within 5 minutes
  const currentlyActive = useMemo(() => {
    if (!userTable) return [];
    const threshold = Date.now() - 5 * 60 * 1000;
    return userTable.filter(u => {
      const lastActive = u.lastActive ? new Date(u.lastActive).getTime() : 0;
      return lastActive >= threshold;
    });
  }, [userTable]);

  // User Activity Report: all users with login data, sorted by most recent
  const activityReport = useMemo(() => {
    if (!userTable) return [];
    return [...userTable]
      .filter(u => u.lastLogin)
      .sort((a, b) => new Date(b.lastLogin!).getTime() - new Date(a.lastLogin!).getTime());
  }, [userTable]);

  const moduleChartConfig = {
    uniqueUsers: { label: "Unique Users", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={String(dateRange)} onValueChange={v => setDateRange(Number(v))}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DATE_PRESETS.map(p => (
              <SelectItem key={p.days} value={String(p.days)}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deptId} onValueChange={setDeptId}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {(departments || []).map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Smart Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {alerts.map((alert, i) => {
            const alertMetric = getAlertMetric(alert);
            return (
              <Card
                key={i}
                className={`border-l-4 ${alert.severity === "critical" ? "border-l-destructive" : "border-l-amber-500"} ${alertMetric ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}`}
                onClick={alertMetric ? () => openDrawer(alertMetric) : undefined}
              >
                <CardContent className="p-3 flex items-start gap-2">
                  <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${alert.severity === "critical" ? "text-destructive" : "text-amber-500"}`} />
                  <span className="text-xs">{alert.message}</span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <KPICard icon={Activity} label="Active Today" value={kpis?.activeToday ?? 0} loading={kpisLoading} color="text-emerald-500" onClick={() => openDrawer("active_today")} />
        <KPICard icon={TrendingUp} label="7-Day Active" value={kpis?.active7d ?? 0} loading={kpisLoading} color="text-blue-500" onClick={() => openDrawer("active_7d")} />
        <KPICard icon={Users} label="30-Day Active" value={kpis?.active30d ?? 0} loading={kpisLoading} color="text-primary" onClick={() => openDrawer("active_30d")} />
        <KPICard icon={UserX} label="Never Logged In" value={kpis?.neverLoggedIn ?? 0} loading={kpisLoading} color="text-destructive" onClick={() => openDrawer("never_logged_in")} />
        <KPICard icon={Clock} label="Dormant (14d+)" value={kpis?.dormant ?? 0} loading={kpisLoading} color="text-amber-500" onClick={() => openDrawer("dormant")} />
      </div>

      {/* Currently Active + Module Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Currently Active Panel */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <Wifi className="h-4 w-4 text-emerald-500" /> Currently Active
              <Badge variant="secondary" className="ml-auto text-[10px]">{currentlyActive.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {currentlyActive.length > 0 ? (
              <div className="max-h-[200px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="text-[10px]">
                      <TableHead className="py-1.5 px-2">User</TableHead>
                      <TableHead className="py-1.5 px-2">Department</TableHead>
                      <TableHead className="py-1.5 px-2">Last Seen</TableHead>
                      <TableHead className="py-1.5 px-2 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentlyActive.map(u => (
                      <TableRow key={u.userId} className="text-xs">
                        <TableCell className="py-1 px-2 font-medium">{u.name}</TableCell>
                        <TableCell className="py-1 px-2 text-muted-foreground">{u.department || "—"}</TableCell>
                        <TableCell className="py-1 px-2 text-muted-foreground">
                          {u.lastActive ? formatDistanceToNow(new Date(u.lastActive), { addSuffix: true }) : "—"}
                        </TableCell>
                        <TableCell className="py-1 px-2 text-center">
                          <Badge className="text-[9px] bg-emerald-500/20 text-emerald-600 border-emerald-500/30" variant="outline">Active</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">
                No users currently active
              </div>
            )}
          </CardContent>
        </Card>

        {/* Module Usage */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" /> Module Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {moduleUsage && moduleUsage.length > 0 ? (
              <ChartContainer config={moduleChartConfig} className="h-[200px] w-full">
                <BarChart data={moduleUsage.map(m => ({ ...m, module: MODULE_LABELS[m.module] || m.module }))} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-[10px]" />
                  <YAxis type="category" dataKey="module" width={120} className="text-[10px]" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="uniqueUsers" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-xs text-muted-foreground">No activity data</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Activity Report (Collapsible) */}
      <Collapsible open={reportOpen} onOpenChange={setReportOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="py-3 px-4 cursor-pointer hover:bg-accent/50 transition-colors">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Activity className="h-4 w-4" /> User Activity Report
                <Badge variant="secondary" className="ml-1 text-[10px]">{activityReport.length}</Badge>
                <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${reportOpen ? "rotate-180" : ""}`} />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="px-2 pb-3 pt-0">
              {activityReport.length > 0 ? (
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-[10px]">
                        <TableHead className="py-1.5 px-2">User</TableHead>
                        <TableHead className="py-1.5 px-2">Department</TableHead>
                        <TableHead className="py-1.5 px-2">Last Login</TableHead>
                        <TableHead className="py-1.5 px-2 text-right">Time Spent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activityReport.map(u => (
                        <TableRow key={u.userId} className="text-xs">
                          <TableCell className="py-1 px-2 font-medium">{u.name}</TableCell>
                          <TableCell className="py-1 px-2 text-muted-foreground">{u.department || "—"}</TableCell>
                          <TableCell className="py-1 px-2">
                            {u.lastLogin ? format(new Date(u.lastLogin), "MMM d, yyyy HH:mm") : "—"}
                          </TableCell>
                          <TableCell className="py-1 px-2 text-right font-mono">
                            {formatDuration(u.totalActiveSeconds)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted-foreground">No login activity recorded yet</div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Detail Drawer */}
      <AdoptionUserDrawer
        open={!!drawerMetric}
        onOpenChange={(open) => { if (!open) setDrawerMetric(null); }}
        metric={drawerMetric}
        users={userTable || []}
      />
    </div>
  );
}

function KPICard({ icon: Icon, label, value, loading, color, onClick }: {
  icon: any; label: string; value: number; loading: boolean; color: string; onClick: () => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent/50 transition-colors hover:shadow-md"
      onClick={onClick}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-muted ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-lg font-bold">{loading ? "—" : value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
