import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CalendarDays, Clock, User, FileText, CheckCircle, XCircle, AlertTriangle, Users } from "lucide-react";
import { format } from "date-fns";
import { getLeaveTypeLabel, getLeaveStatusStyle, getDurationLabel } from "@/lib/leave-utils";
import type { LeaveRequest } from "@/lib/leave-utils";
import { cn } from "@/lib/utils";

type LeaveWithProfile = LeaveRequest & { profiles: { full_name: string | null; email: string | null } };

interface Props {
  leave: LeaveWithProfile | null;
  open: boolean;
  onClose: () => void;
  // Date panel mode
  dateLeaves?: LeaveWithProfile[];
  selectedDate?: Date | null;
  canApprove?: boolean;
  onApprove?: (leave: LeaveRequest) => void;
  onDecline?: (leave: LeaveRequest) => void;
  deptMap?: Map<string, { department_id: string; department_name: string }>;
  deptCapacity?: Map<string, number>;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function getLeaveTypeColor(type: string) {
  if (type === "paid_pto") return "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0";
  if (type === "unpaid_leave") return "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0";
  return "bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-0";
}

export default function LeaveDetailPanel({
  leave, open, onClose, dateLeaves, selectedDate, canApprove, onApprove, onDecline, deptMap, deptCapacity,
}: Props) {
  // Single leave detail mode
  if (leave && !dateLeaves) {
    const style = getLeaveStatusStyle(leave.status);
    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-lg">Leave Details</SheetTitle>
          </SheetHeader>

          <div className="space-y-5">
            {/* Employee info */}
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {getInitials(leave.profiles?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold">{leave.profiles?.full_name || "Employee"}</p>
                <p className="text-xs text-muted-foreground">{leave.profiles?.email}</p>
              </div>
            </div>

            <Separator />

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Leave Type</p>
                <Badge variant="outline" className={`text-xs ${getLeaveTypeColor(leave.leave_type)}`}>
                  {getLeaveTypeLabel(leave.leave_type)}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
                <Badge variant="outline" className={`text-xs border-0 ${style.bg} ${style.text}`}>
                  {style.label}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Start Date</p>
                <p className="text-sm font-medium">{format(new Date(leave.date_from), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">End Date</p>
                <p className="text-sm font-medium">{format(new Date(leave.date_to), "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Total Days</p>
                <p className="text-sm font-medium">{leave.working_days_count} {getDurationLabel(leave.duration_type) !== "Full Day" ? `(${getDurationLabel(leave.duration_type)})` : "day(s)"}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Filed</p>
                <p className="text-sm font-medium">{format(new Date(leave.created_at), "MMM d, yyyy")}</p>
              </div>
            </div>

            {leave.notes && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{leave.notes}</p>
              </div>
            )}

            {leave.reason && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Reason</p>
                <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">{leave.reason}</p>
              </div>
            )}

            {/* Actions */}
            {canApprove && leave.status === "submitted" && (
              <>
                <Separator />
                <div className="flex gap-3">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => onApprove?.(leave)}>
                    <CheckCircle className="h-4 w-4 mr-1" /> Approve
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => onDecline?.(leave)}>
                    <XCircle className="h-4 w-4 mr-1" /> Decline
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Date panel mode (calendar click)
  if (dateLeaves && selectedDate) {
    // Group by department
    const groups = new Map<string, { name: string; leaves: LeaveWithProfile[]; capacity: number }>();
    for (const l of dateLeaves) {
      const dept = deptMap?.get(l.user_id);
      const deptId = dept?.department_id || "unknown";
      const deptName = dept?.department_name || "Unassigned";
      if (!groups.has(deptId)) groups.set(deptId, { name: deptName, leaves: [], capacity: deptCapacity?.get(deptId) || 2 });
      groups.get(deptId)!.leaves.push(l);
    }

    return (
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-base">{format(selectedDate, "EEEE, MMMM d, yyyy")}</SheetTitle>
          </SheetHeader>

          <div className="mt-3 space-y-4">
            {dateLeaves.length === 0 ? (
              <div className="py-12 text-center">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No one is on leave this day</p>
              </div>
            ) : (
              <>
                <Badge variant="secondary" className="bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-0">
                  <Users className="h-3 w-3 mr-1" />
                  {dateLeaves.length} on leave
                </Badge>

                {[...groups.entries()].map(([deptId, group]) => {
                  const atCapacity = group.leaves.length >= group.capacity;
                  return (
                    <div key={deptId} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-[10px] font-medium px-2 py-0.5 rounded-full",
                            atCapacity ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" : "bg-muted text-muted-foreground"
                          )}>
                            {group.leaves.length}/{group.capacity}
                          </span>
                          {atCapacity && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                        </div>
                      </div>
                      {group.leaves.map((l) => {
                        const style = getLeaveStatusStyle(l.status);
                        return (
                          <div key={l.id} className="bg-muted/30 rounded-lg p-3 space-y-1">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                                  {getInitials(l.profiles?.full_name)}
                                </AvatarFallback>
                              </Avatar>
                              <p className="font-medium text-sm">{l.profiles?.full_name || "Employee"}</p>
                            </div>
                            <div className="flex items-center gap-2 pl-8">
                              <Badge variant="outline" className={`text-[9px] h-4 ${getLeaveTypeColor(l.leave_type)}`}>
                                {getLeaveTypeLabel(l.leave_type)}
                              </Badge>
                              <Badge variant="outline" className={`text-[9px] h-4 border-0 ${style.bg} ${style.text}`}>
                                {style.label}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{getDurationLabel(l.duration_type)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return null;
}
