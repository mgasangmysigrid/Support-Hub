import { useState, useMemo } from "react";
import { Navigate } from "react-router-dom";
import { useLeaveOverview, useCanAccessLeaveOverview, LOW_PTO_THRESHOLD_HOURS, LOW_PTO_THRESHOLD_DAYS, type LeaveOverviewFilters, type EmployeeLeaveRow } from "@/hooks/useLeaveOverview";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Users, Clock, AlertTriangle, CheckCircle, FileText,
  Download, Search, CalendarDays, ChevronUp, ChevronDown, Eye,
} from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/** Format hours as "Xd (Xh)" with both days and hours */
function fmtHours(h: number): string {
  if (h === 0) return "—";
  const days = h / 8;
  return `${days.toFixed(1)}d (${h.toFixed(1)}h)`;
}

/** Format credits showing both days and hours */
function fmtCredits(h: number): string {
  const days = h / 8;
  return `${days.toFixed(1)}d (${h.toFixed(0)}h)`;
}

type SortKey = keyof Pick<EmployeeLeaveRow,
  "fullName" | "departmentName" | "approvedPtoHours" | "pendingPtoHours" |
  "approvedLwopHours" | "pendingLwopHours" | "currentPtoCredits" | "currentBirthdayCredits"
>;

const datePresets = [
  { label: "This Month", getValue: () => {
    const now = new Date();
    return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: format(endOfMonth(now), "yyyy-MM-dd") };
  }},
  { label: "This Year", getValue: () => {
    const now = new Date();
    return { from: format(startOfYear(now), "yyyy-MM-dd"), to: format(endOfYear(now), "yyyy-MM-dd") };
  }},
];

export default function LeaveOverview() {
  const { data: canAccess, isLoading: accessLoading } = useCanAccessLeaveOverview();

  const now = new Date();
  const [filters, setFilters] = useState<LeaveOverviewFilters>({
    departmentId: null,
    search: "",
    statusView: "all",
    dateFrom: format(startOfMonth(now), "yyyy-MM-dd"),
    dateTo: format(endOfMonth(now), "yyyy-MM-dd"),
  });

  const [sortKey, setSortKey] = useState<SortKey>("fullName");
  const [sortAsc, setSortAsc] = useState(true);
  const [detailEmployee, setDetailEmployee] = useState<EmployeeLeaveRow | null>(null);

  const { data, isLoading } = useLeaveOverview(filters);
  const rows = data?.rows || [];
  const summary = data?.summary;
  const departments = data?.departments || [];

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortAsc ? (Number(av) - Number(bv)) : (Number(bv) - Number(av));
    });
  }, [rows, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />;
  };

  const exportCSV = () => {
    const headers = ["Employee", "Department", "Approved PTO (hours)", "Pending PTO (hours)", "Approved LWOP (hours)", "Pending LWOP (hours)", "PTO Credits (hours)", "Birthday Credits (hours)"];
    const csvRows = sorted.map(r => [
      r.fullName, r.departmentName,
      r.approvedPtoHours.toFixed(1), r.pendingPtoHours.toFixed(1),
      r.approvedLwopHours.toFixed(1), r.pendingLwopHours.toFixed(1),
      r.currentPtoCredits.toFixed(1), r.currentBirthdayCredits.toFixed(1),
    ]);
    const csv = [headers, ...csvRows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const dateLabel = `${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `leave-overview-${dateLabel}.csv`;
    a.click();
  };

  if (accessLoading) return <div className="flex items-center justify-center min-h-[400px]"><Skeleton className="h-8 w-48" /></div>;
  if (canAccess === false) return <Navigate to="/" replace />;

  const summaryCards = summary ? [
    { label: "Total Employees", value: summary.totalEmployees, icon: Users, color: "text-primary" },
    { label: "Pending PTO", value: summary.withPendingPto, icon: Clock, color: "text-amber-600" },
    { label: "Pending LWOP", value: summary.withPendingLwop, icon: Clock, color: "text-amber-500" },
    { label: "Approved PTO", value: fmtHours(summary.totalApprovedPtoHours), icon: CheckCircle, color: "text-green-600" },
    { label: "Approved LWOP", value: fmtHours(summary.totalApprovedLwopHours), icon: FileText, color: "text-blue-600" },
    { label: `Low PTO (< ${LOW_PTO_THRESHOLD_DAYS}d)`, value: summary.withLowPtoBalance, icon: AlertTriangle, color: "text-destructive" },
  ] : [];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Leave Overview</h1>
          <p className="text-sm text-muted-foreground">Employee leave status and balances across the organization</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-48">
          <label className="text-xs text-muted-foreground mb-1 block">Department</label>
          <Select value={filters.departmentId || "__all"} onValueChange={v => setFilters(f => ({ ...f, departmentId: v === "__all" ? null : v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="w-52">
          <label className="text-xs text-muted-foreground mb-1 block">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Name or email..."
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              className="h-9 text-sm pl-8"
            />
          </div>
        </div>

        <div className="w-48">
          <label className="text-xs text-muted-foreground mb-1 block">Status View</label>
          <Select value={filters.statusView} onValueChange={(v: any) => setFilters(f => ({ ...f, statusView: v }))}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending_pto">With Pending PTO</SelectItem>
              <SelectItem value="approved_pto">With Approved PTO</SelectItem>
              <SelectItem value="approved_lwop">With Approved LWOP</SelectItem>
              <SelectItem value="low_balance">Low PTO Balance (&lt; {LOW_PTO_THRESHOLD_DAYS}d)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 items-end">
          {datePresets.map(p => (
            <Button key={p.label} variant="outline" size="sm" className="h-9 text-xs"
              onClick={() => { const v = p.getValue(); setFilters(f => ({ ...f, dateFrom: v.from, dateTo: v.to })); }}
            >{p.label}</Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {filters.dateFrom && filters.dateTo
                  ? `${format(new Date(filters.dateFrom + "T00:00:00"), "MMM d")} – ${format(new Date(filters.dateTo + "T00:00:00"), "MMM d, yyyy")}`
                  : "Custom Range"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="end">
              <Calendar
                mode="range"
                selected={filters.dateFrom && filters.dateTo ? {
                  from: new Date(filters.dateFrom + "T00:00:00"),
                  to: new Date(filters.dateTo + "T00:00:00"),
                } : undefined}
                onSelect={(range) => {
                  if (range?.from) setFilters(f => ({
                    ...f,
                    dateFrom: format(range.from!, "yyyy-MM-dd"),
                    dateTo: range.to ? format(range.to, "yyyy-MM-dd") : format(range.from!, "yyyy-MM-dd"),
                  }));
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {summaryCards.map(c => (
              <Card key={c.label} className="border">
                <CardContent className="p-4 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <c.icon className={`h-4 w-4 ${c.color}`} />
                    <span className="text-xs text-muted-foreground">{c.label}</span>
                  </div>
                  <span className="text-xl font-bold">{c.value}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Table */}
          {sorted.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {filters.search ? "No employees match your search." :
                   filters.statusView !== "all" ? "No employees match the selected status filter." :
                   "No employee data found for the selected period."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    {([
                      ["fullName", "Employee"],
                      ["departmentName", "Department"],
                      ["approvedPtoHours", "Approved PTO"],
                      ["pendingPtoHours", "Pending PTO"],
                      ["approvedLwopHours", "Approved LWOP"],
                      ["pendingLwopHours", "Pending LWOP"],
                      ["currentPtoCredits", "PTO Credits"],
                      ["currentBirthdayCredits", "Birthday Credits"],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <TableHead key={key}
                        className="text-xs cursor-pointer hover:text-foreground select-none"
                        onClick={() => handleSort(key)}
                      >
                        {label} <SortIcon col={key} />
                      </TableHead>
                    ))}
                    <TableHead className="text-xs w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(r => (
                    <TableRow key={r.userId} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-sm font-medium">{r.fullName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.departmentName}</TableCell>
                      <TableCell>
                        {r.approvedPtoHours > 0
                          ? <Badge className="bg-green-600/10 text-green-700 border-green-200 text-[11px]">{fmtHours(r.approvedPtoHours)}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.pendingPtoHours > 0
                          ? <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-[11px]">{fmtHours(r.pendingPtoHours)}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.approvedLwopHours > 0
                          ? <Badge className="bg-green-600/10 text-green-700 border-green-200 text-[11px]">{fmtHours(r.approvedLwopHours)}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {r.pendingLwopHours > 0
                          ? <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-[11px]">{fmtHours(r.pendingLwopHours)}</Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[11px] ${r.currentPtoCredits < LOW_PTO_THRESHOLD_HOURS ? "border-destructive text-destructive" : "border-green-500 text-green-700"}`}>
                          {fmtCredits(r.currentPtoCredits)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[11px] ${r.currentBirthdayCredits <= 0 ? "border-muted-foreground text-muted-foreground" : "border-violet-500 text-violet-700"}`}>
                          {fmtCredits(r.currentBirthdayCredits)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailEmployee(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}

      {/* Detail Drill-Down */}
      <EmployeeDetailSheet employee={detailEmployee} open={!!detailEmployee} onClose={() => setDetailEmployee(null)} dateFrom={filters.dateFrom} dateTo={filters.dateTo} />
    </div>
  );
}

function EmployeeDetailSheet({ employee, open, onClose, dateFrom, dateTo }: {
  employee: EmployeeLeaveRow | null;
  open: boolean;
  onClose: () => void;
  dateFrom: string | null;
  dateTo: string | null;
}) {
  const { data: recentRequests, isLoading } = useQuery({
    queryKey: ["leave-overview-detail", employee?.userId, dateFrom, dateTo],
    enabled: !!employee,
    queryFn: async () => {
      let query = supabase
        .from("leave_requests")
        .select("id, leave_type, status, date_from, date_to, total_hours, working_days_count, duration_type, reason, created_at")
        .eq("user_id", employee!.userId)
        .order("date_from", { ascending: false });

      // Apply the same date range filter as the main view
      if (dateFrom) {
        query = query.gte("date_to", dateFrom);
      }
      if (dateTo) {
        query = query.lte("date_from", dateTo);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  if (!employee) return null;
  const e = employee;

  const cards = [
    { label: "Approved PTO", value: fmtHours(e.approvedPtoHours), color: "text-green-600" },
    { label: "Pending PTO", value: fmtHours(e.pendingPtoHours), color: "text-amber-600" },
    { label: "Approved LWOP", value: fmtHours(e.approvedLwopHours), color: "text-green-600" },
    { label: "Pending LWOP", value: fmtHours(e.pendingLwopHours), color: "text-amber-500" },
    { label: "PTO Credits", value: fmtCredits(e.currentPtoCredits), color: e.currentPtoCredits < LOW_PTO_THRESHOLD_HOURS ? "text-destructive" : "text-green-600" },
    { label: "Birthday Credits", value: fmtCredits(e.currentBirthdayCredits), color: "text-violet-600" },
  ];

  const leaveTypeLabel = (t: string) => {
    if (t === "paid_pto") return "PTO";
    if (t === "unpaid_leave") return "LWOP";
    if (t === "birthday_leave") return "Birthday";
    return t;
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-600/10 text-green-700 border-green-200 text-[10px]">Approved</Badge>;
    if (s === "submitted") return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200 text-[10px]">Pending</Badge>;
    if (s === "declined") return <Badge variant="destructive" className="text-[10px]">Declined</Badge>;
    if (s === "cancelled" || s === "withdrawn") return <Badge variant="outline" className="text-[10px]">Cancelled</Badge>;
    if (s === "draft") return <Badge variant="outline" className="text-[10px] text-muted-foreground">Draft</Badge>;
    return <Badge variant="outline" className="text-[10px] capitalize">{s}</Badge>;
  };

  const periodLabel = dateFrom && dateTo
    ? `${format(new Date(dateFrom + "T00:00:00"), "MMM d")} – ${format(new Date(dateTo + "T00:00:00"), "MMM d, yyyy")}`
    : "All Time";

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[65vw] lg:max-w-[900px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{e.fullName}</SheetTitle>
          <p className="text-xs text-muted-foreground">{e.departmentName}</p>
        </SheetHeader>

        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-4">
          {cards.map(c => (
            <Card key={c.label} className="border">
              <CardContent className="p-3 flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">{c.label}</span>
                <span className={`text-lg font-bold ${c.color}`}>{c.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-2 mt-5 mb-2">
          <h4 className="text-sm font-semibold">Leave Requests</h4>
          <Badge variant="outline" className="text-[10px] font-normal">{periodLabel}</Badge>
        </div>
        {isLoading ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : !recentRequests || recentRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No leave requests found for this period.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden" style={{ maxHeight: "calc(100vh - 350px)" }}>
            <div className="overflow-auto h-full">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">From</TableHead>
                    <TableHead className="text-xs">To</TableHead>
                    <TableHead className="text-xs">Days</TableHead>
                    <TableHead className="text-xs">Hours</TableHead>
                    <TableHead className="text-xs">Duration</TableHead>
                    <TableHead className="text-xs">Filed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentRequests.map(lr => (
                    <TableRow key={lr.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-xs font-medium">{leaveTypeLabel(lr.leave_type)}</TableCell>
                      <TableCell>{statusBadge(lr.status)}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(lr.date_from + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(lr.date_to + "T00:00:00"), "MMM d, yyyy")}</TableCell>
                      <TableCell className="text-xs">{Number(lr.working_days_count).toFixed(1)}</TableCell>
                      <TableCell className="text-xs">{Number(lr.total_hours).toFixed(1)}h</TableCell>
                      <TableCell className="text-xs capitalize">{lr.duration_type.replace("_", " ")}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{format(new Date(lr.created_at), "MMM d, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
