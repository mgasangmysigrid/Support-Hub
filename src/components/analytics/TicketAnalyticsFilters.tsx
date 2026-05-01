import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, RotateCcw } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "@/lib/utils";
import type { AnalyticsFilters } from "@/hooks/useTicketAnalytics";

interface Props {
  filters: AnalyticsFilters;
  onChange: (f: Partial<AnalyticsFilters>) => void;
  departments: { id: string; name: string }[];
  employees: { id: string; full_name: string | null; email: string | null }[];
  showDeptFilter: boolean;
  showEmployeeFilter: boolean;
}

const presets = [
  { label: "Today", fn: () => { const d = format(new Date(), "yyyy-MM-dd"); return { dateFrom: d, dateTo: d }; } },
  { label: "This Week", fn: () => ({ dateFrom: format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd"), dateTo: format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd") }) },
  { label: "This Month", fn: () => ({ dateFrom: format(startOfMonth(new Date()), "yyyy-MM-dd"), dateTo: format(endOfMonth(new Date()), "yyyy-MM-dd") }) },
  { label: "Last Month", fn: () => ({ dateFrom: format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"), dateTo: format(endOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd") }) },
  { label: "Last 90 Days", fn: () => ({ dateFrom: format(subDays(new Date(), 90), "yyyy-MM-dd"), dateTo: format(new Date(), "yyyy-MM-dd") }) },
];

export default function TicketAnalyticsFilters({ filters, onChange, departments, employees, showDeptFilter, showEmployeeFilter }: Props) {
  const resetFilters = () => onChange({
    dateFrom: null, dateTo: null, departmentId: null, employeeId: null,
    status: null, priority: null, slaStatus: null, dateMode: "created",
  });

  return (
    <div className="flex flex-wrap items-end gap-3">
      {/* Date presets */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => (
          <Button key={p.label} variant="outline" size="sm" className="text-xs h-8"
            onClick={() => onChange(p.fn())}>
            {p.label}
          </Button>
        ))}
      </div>

      {/* Custom date from */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", !filters.dateFrom && "text-muted-foreground")}>
            <CalendarIcon className="h-3.5 w-3.5" />
            {filters.dateFrom ? format(new Date(filters.dateFrom + "T00:00:00"), "MMM d, yyyy") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" className="p-3 pointer-events-auto"
            selected={filters.dateFrom ? new Date(filters.dateFrom + "T00:00:00") : undefined}
            onSelect={d => onChange({ dateFrom: d ? format(d, "yyyy-MM-dd") : null })} />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", !filters.dateTo && "text-muted-foreground")}>
            <CalendarIcon className="h-3.5 w-3.5" />
            {filters.dateTo ? format(new Date(filters.dateTo + "T00:00:00"), "MMM d, yyyy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" className="p-3 pointer-events-auto"
            selected={filters.dateTo ? new Date(filters.dateTo + "T00:00:00") : undefined}
            onSelect={d => onChange({ dateTo: d ? format(d, "yyyy-MM-dd") : null })} />
        </PopoverContent>
      </Popover>

      {/* Department */}
      {showDeptFilter && (
        <Select value={filters.departmentId || "__all"} onValueChange={v => onChange({ departmentId: v === "__all" ? null : v })}>
          <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Employee */}
      {showEmployeeFilter && (
        <Select value={filters.employeeId || "__all"} onValueChange={v => onChange({ employeeId: v === "__all" ? null : v })}>
          <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All Employees</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name || e.email || "Unknown"}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      {/* Status */}
      <Select value={filters.status || "__all"} onValueChange={v => onChange({ status: v === "__all" ? null : v })}>
        <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All Statuses</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="in_progress">In Progress</SelectItem>
          <SelectItem value="blocked">Blocked</SelectItem>
          <SelectItem value="for_review">For Review</SelectItem>
          <SelectItem value="closed">Closed</SelectItem>
        </SelectContent>
      </Select>

      {/* Priority */}
      <Select value={filters.priority || "__all"} onValueChange={v => onChange({ priority: v === "__all" ? null : v })}>
        <SelectTrigger className="h-8 text-xs w-[120px]"><SelectValue placeholder="Priority" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All Priorities</SelectItem>
          <SelectItem value="critical">Critical</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="low">Low</SelectItem>
        </SelectContent>
      </Select>

      {/* SLA Status */}
      <Select value={filters.slaStatus || "__all"} onValueChange={v => onChange({ slaStatus: v === "__all" ? null : v })}>
        <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue placeholder="SLA Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All SLA</SelectItem>
          <SelectItem value="met">SLA Met</SelectItem>
          <SelectItem value="breached">SLA Breached</SelectItem>
          <SelectItem value="no_sla">No SLA</SelectItem>
        </SelectContent>
      </Select>

      {/* Date mode */}
      <Select value={filters.dateMode} onValueChange={v => onChange({ dateMode: v as "created" | "resolved" })}>
        <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="created">By Created Date</SelectItem>
          <SelectItem value="resolved">By Resolved Date</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={resetFilters}>
        <RotateCcw className="h-3.5 w-3.5" /> Reset
      </Button>
    </div>
  );
}
