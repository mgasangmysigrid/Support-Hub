import { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Download, ChevronRight, Inbox } from "lucide-react";
import type { EmployeeMetrics, AnalyticsFilters } from "@/hooks/useTicketAnalytics";
import EmployeeDrillDown from "./EmployeeDrillDown";

function formatHours(h: number): string {
  if (h === 0) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  const days = Math.floor(h / 24);
  const rem = h % 24;
  return `${days}d ${rem.toFixed(0)}h`;
}

function rateBadge(val: number) {
  const cls = val >= 80 ? "border-green-500 text-green-700 bg-green-50" : val >= 50 ? "border-amber-500 text-amber-700 bg-amber-50" : "border-destructive text-destructive bg-red-50";
  return <Badge variant="outline" className={cls}>{val.toFixed(1)}%</Badge>;
}

type SortKey = keyof EmployeeMetrics;

export default function EmployeePerformanceTable({ data, filters }: { data: EmployeeMetrics[]; filters: AnalyticsFilters }) {
  const [sortKey, setSortKey] = useState<SortKey>("ticketsProcessed");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeMetrics | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const exportCsv = () => {
    const headers = ["Employee", "Department", "Processed", "Resolved", "Resolution Rate", "SLA Met", "SLA Eligible", "SLA Compliance", "Avg Resolution", "Avg First Response", "Open", "Breached", "Reopened"];
    const rows = sorted.map(e => [
      e.fullName, e.departmentName, e.ticketsProcessed, e.resolved,
      `${e.resolutionRate.toFixed(1)}%`, e.slaMet, e.slaEligible,
      `${e.slaComplianceRate.toFixed(1)}%`, formatHours(e.avgResolutionHours),
      formatHours(e.avgFirstResponseHours), e.openTickets, e.breachedTickets, e.reopenedTickets,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateRange = filters.dateFrom && filters.dateTo
      ? `${filters.dateFrom}-to-${filters.dateTo}`
      : "all-time";
    a.href = url;
    a.download = `ticket-performance-employee-${dateRange}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <TableHead className="cursor-pointer select-none whitespace-nowrap text-xs" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === field ? "text-foreground" : "text-muted-foreground/50"}`} />
      </div>
    </TableHead>
  );

  if (!data.length) {
    return (
      <div className="text-center py-12 space-y-2">
        <div className="flex justify-center"><div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Inbox className="h-5 w-5 text-muted-foreground" /></div></div>
        <p className="text-sm font-medium text-muted-foreground">No employee ticket data found</p>
        <p className="text-xs text-muted-foreground">
          {filters.dateFrom || filters.dateTo
            ? "No tickets match the selected date range. Try widening your filters."
            : filters.slaStatus
            ? "No tickets match the selected SLA status filter."
            : "No tickets are visible within your current access scope."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Employee Performance</h3>
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1" onClick={exportCsv}>
          <Download className="h-3 w-3" /> Export CSV
        </Button>
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortHeader label="Employee" field="fullName" />
              <SortHeader label="Department" field="departmentName" />
              <SortHeader label="Processed" field="ticketsProcessed" />
              <SortHeader label="Resolved" field="resolved" />
              <SortHeader label="Resolution %" field="resolutionRate" />
              <SortHeader label="SLA Met" field="slaMet" />
              <SortHeader label="SLA %" field="slaComplianceRate" />
              <SortHeader label="Avg Res. Time" field="avgResolutionHours" />
              <SortHeader label="Avg 1st Resp." field="avgFirstResponseHours" />
              <SortHeader label="Open" field="openTickets" />
              <SortHeader label="Breached" field="breachedTickets" />
              <SortHeader label="Reopened" field="reopenedTickets" />
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(e => (
              <TableRow key={e.userId} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedEmployee(e)}>
                <TableCell className="font-medium text-sm whitespace-nowrap">{e.fullName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.departmentName}</TableCell>
                <TableCell className="font-semibold">{e.ticketsProcessed}</TableCell>
                <TableCell>{e.resolved}</TableCell>
                <TableCell>{rateBadge(e.resolutionRate)}</TableCell>
                <TableCell className="text-xs">{e.slaMet}/{e.slaEligible}</TableCell>
                <TableCell>{rateBadge(e.slaComplianceRate)}</TableCell>
                <TableCell className="text-xs">{formatHours(e.avgResolutionHours)}</TableCell>
                <TableCell className="text-xs">{formatHours(e.avgFirstResponseHours)}</TableCell>
                <TableCell>{e.openTickets}</TableCell>
                <TableCell>
                  {e.breachedTickets > 0 ? (
                    <Badge variant="destructive" className="text-xs">{e.breachedTickets}</Badge>
                  ) : <span className="text-muted-foreground">0</span>}
                </TableCell>
                <TableCell>{e.reopenedTickets || <span className="text-muted-foreground">0</span>}</TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EmployeeDrillDown
        employee={selectedEmployee}
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
      />
    </div>
  );
}
