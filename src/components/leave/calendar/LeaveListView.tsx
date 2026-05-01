import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowUpDown, CalendarX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { getLeaveTypeLabel, getLeaveStatusStyle, getDurationLabel } from "@/lib/leave-utils";
import type { LeaveRequest } from "@/lib/leave-utils";

type LeaveWithProfile = LeaveRequest & { profiles: { full_name: string | null; email: string | null } };

type SortField = "name" | "date_from" | "status" | "leave_type";
type SortDir = "asc" | "desc";

interface Props {
  leaves: LeaveWithProfile[];
  onSelectLeave: (leave: LeaveWithProfile) => void;
  deptMap?: Map<string, { department_id: string; department_name: string }>;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function getLeaveTypeBadgeClass(type: string) {
  if (type === "paid_pto") return "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0";
  if (type === "unpaid_leave") return "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0";
  return "bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-0";
}

export default function LeaveListView({ leaves, onSelectLeave, deptMap }: Props) {
  const [sortField, setSortField] = useState<SortField>("date_from");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const sorted = useMemo(() => {
    return [...leaves].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = (a.profiles?.full_name || "").localeCompare(b.profiles?.full_name || "");
          break;
        case "date_from":
          cmp = a.date_from.localeCompare(b.date_from);
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "leave_type":
          cmp = a.leave_type.localeCompare(b.leave_type);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [leaves, sortField, sortDir]);

  if (!leaves.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <CalendarX className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-muted-foreground">No leave records found for this view.</p>
        </CardContent>
      </Card>
    );
  }

  const SortButton = ({ field, label }: { field: SortField; label: string }) => (
    <Button variant="ghost" size="sm" className="h-auto p-0 text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className="h-3 w-3 ml-1" />
    </Button>
  );

  return (
    <Card className="overflow-hidden">
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead><SortButton field="name" label="Employee" /></TableHead>
              <TableHead><SortButton field="leave_type" label="Leave Type" /></TableHead>
              <TableHead><SortButton field="date_from" label="Start Date" /></TableHead>
              <TableHead>End Date</TableHead>
              <TableHead className="text-center">Days</TableHead>
              <TableHead><SortButton field="status" label="Status" /></TableHead>
              {deptMap && <TableHead>Department</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((leave) => {
              const style = getLeaveStatusStyle(leave.status);
              const dept = deptMap?.get(leave.user_id);
              return (
                <TableRow
                  key={leave.id}
                  className="cursor-pointer hover:bg-accent/30 transition-colors"
                  onClick={() => onSelectLeave(leave)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                          {getInitials(leave.profiles?.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{leave.profiles?.full_name || "Employee"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${getLeaveTypeBadgeClass(leave.leave_type)}`}>
                      {getLeaveTypeLabel(leave.leave_type)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{format(new Date(leave.date_from), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-sm">{format(new Date(leave.date_to), "MMM d, yyyy")}</TableCell>
                  <TableCell className="text-center text-sm font-medium">{leave.working_days_count}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] border-0 ${style.bg} ${style.text}`}>
                      {style.label}
                    </Badge>
                  </TableCell>
                  {deptMap && (
                    <TableCell className="text-xs text-muted-foreground">{dept?.department_name || "—"}</TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
