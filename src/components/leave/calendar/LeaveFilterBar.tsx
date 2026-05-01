import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, LayoutGrid, CalendarDays, List, RotateCcw } from "lucide-react";

interface FilterState {
  search: string;
  leaveType: string;
  status: string;
  department: string;
  onlyMine: boolean;
}

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  viewMode: "month" | "week" | "list";
  onViewModeChange: (mode: "month" | "week" | "list") => void;
  onToday: () => void;
  departments?: { id: string; name: string }[];
}

export default function LeaveFilterBar({ filters, onChange, viewMode, onViewModeChange, onToday, departments }: Props) {
  const hasFilters = filters.search || filters.leaveType !== "all" || filters.status !== "all" || filters.department !== "all" || filters.onlyMine;

  const update = (partial: Partial<FilterState>) => onChange({ ...filters, ...partial });
  const clearAll = () => onChange({ search: "", leaveType: "all", status: "all", department: "all", onlyMine: false });

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-card border rounded-xl p-3 shadow-sm">
      {/* Search */}
      <div className="relative flex-1 min-w-0 w-full sm:max-w-[220px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search employee..."
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          className="pl-9 h-9 text-sm"
        />
      </div>

      {/* Leave Type */}
      <Select value={filters.leaveType} onValueChange={(v) => update({ leaveType: v })}>
        <SelectTrigger className="w-[140px] h-9 text-sm">
          <SelectValue placeholder="Leave Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="paid_pto">PTO</SelectItem>
          <SelectItem value="unpaid_leave">LWOP</SelectItem>
          <SelectItem value="birthday_leave">Birthday</SelectItem>
        </SelectContent>
      </Select>

      {/* Status */}
      <Select value={filters.status} onValueChange={(v) => update({ status: v })}>
        <SelectTrigger className="w-[140px] h-9 text-sm">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="submitted">Pending</SelectItem>
          <SelectItem value="declined">Declined</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>

      {/* Department */}
      {departments && departments.length > 0 && (
        <Select value={filters.department} onValueChange={(v) => update({ department: v })}>
          <SelectTrigger className="w-[160px] h-9 text-sm">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Only Mine */}
      <Button
        variant={filters.onlyMine ? "default" : "outline"}
        size="sm"
        className="h-9 text-xs"
        onClick={() => update({ onlyMine: !filters.onlyMine })}
      >
        My Leave
      </Button>

      {/* Clear */}
      {hasFilters && (
        <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={clearAll}>
          <RotateCcw className="h-3 w-3 mr-1" /> Clear
        </Button>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* View toggle */}
      <div className="flex border rounded-lg overflow-hidden shrink-0">
        <Button variant={viewMode === "month" ? "default" : "ghost"} size="sm" className="rounded-none h-9 px-3" onClick={() => onViewModeChange("month")}>
          <LayoutGrid className="h-3.5 w-3.5 mr-1" /> Month
        </Button>
        <Button variant={viewMode === "week" ? "default" : "ghost"} size="sm" className="rounded-none h-9 px-3" onClick={() => onViewModeChange("week")}>
          <CalendarDays className="h-3.5 w-3.5 mr-1" /> Week
        </Button>
        <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="rounded-none h-9 px-3" onClick={() => onViewModeChange("list")}>
          <List className="h-3.5 w-3.5 mr-1" /> List
        </Button>
      </div>

      <Button variant="outline" size="sm" className="h-9" onClick={onToday}>Today</Button>
    </div>
  );
}
