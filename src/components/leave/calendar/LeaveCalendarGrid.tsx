import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users, AlertTriangle } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  isSameMonth, isSameDay, isToday, addWeeks, subWeeks, isWeekend,
} from "date-fns";
import { cn } from "@/lib/utils";
import type { LeaveRequest } from "@/lib/leave-utils";

type LeaveWithProfile = LeaveRequest & { profiles: { full_name: string | null; email: string | null } };

interface Props {
  leaves: LeaveWithProfile[];
  currentMonth: Date;
  currentWeekStart: Date;
  viewMode: "month" | "week";
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
  onMonthChange: (date: Date) => void;
  onWeekChange: (date: Date) => void;
  deptMap?: Map<string, { department_id: string; department_name: string }>;
  deptCapacity?: Map<string, number>;
  scheduleMap?: Map<string, number[]>;
}

function getLeaveColor(type: string) {
  if (type === "unpaid_leave") return "bg-amber-100/80 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-l-2 border-l-amber-400";
  if (type === "birthday_leave") return "bg-violet-100/80 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 border-l-2 border-l-violet-400";
  return "bg-blue-100/80 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-l-2 border-l-blue-400";
}

function getStatusDot(status: string) {
  if (status === "approved") return "bg-emerald-500";
  if (status === "submitted") return "bg-amber-400";
  return "bg-muted-foreground/40";
}

export default function LeaveCalendarGrid({
  leaves, currentMonth, currentWeekStart, viewMode, selectedDate,
  onSelectDate, onMonthChange, onWeekChange, deptMap, deptCapacity, scheduleMap,
}: Props) {
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    const days: Date[] = [];
    let day = start;
    while (day <= end) { days.push(day); day = addDays(day, 1); }
    return days;
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) days.push(addDays(currentWeekStart, i));
    return days;
  }, [currentWeekStart]);

  const leavesByDate = useMemo(() => {
    const map = new Map<string, LeaveWithProfile[]>();
    for (const leave of leaves) {
      const from = new Date(leave.date_from);
      const to = new Date(leave.date_to);
      const workingDays = scheduleMap?.get(leave.user_id) ?? [1, 2, 3, 4, 5];
      let d = new Date(from);
      while (d <= to) {
        // Only show leave on days that are part of the employee's working schedule
        if (workingDays.includes(d.getDay())) {
          const key = format(d, "yyyy-MM-dd");
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(leave);
        }
        d = addDays(d, 1);
      }
    }
    return map;
  }, [leaves, scheduleMap]);

  const handlePrev = () => {
    if (viewMode === "month") onMonthChange(subMonths(currentMonth, 1));
    else onWeekChange(subWeeks(currentWeekStart, 1));
  };
  const handleNext = () => {
    if (viewMode === "month") onMonthChange(addMonths(currentMonth, 1));
    else onWeekChange(addWeeks(currentWeekStart, 1));
  };

  const renderTitle = () => {
    if (viewMode === "month") return format(currentMonth, "MMMM yyyy");
    const weekEnd = addDays(currentWeekStart, 6);
    return `${format(currentWeekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;
  };

  const renderDayCell = (day: Date, isWeekView: boolean) => {
    const key = format(day, "yyyy-MM-dd");
    const dayLeaves = leavesByDate.get(key) || [];
    const inMonth = isSameMonth(day, currentMonth);
    const dayIsToday = isToday(day);
    const weekend = isWeekend(day);

    // Capacity check
    const deptCounts = new Map<string, number>();
    for (const l of dayLeaves) {
      const dept = deptMap?.get(l.user_id);
      if (dept) deptCounts.set(dept.department_id, (deptCounts.get(dept.department_id) || 0) + 1);
    }
    let capacityWarning = false;
    deptCounts.forEach((count, dId) => {
      if (count >= (deptCapacity?.get(dId) || 2)) capacityWarning = true;
    });

    const maxVisible = isWeekView ? 5 : 3;

    // Deduplicate by leave id for display
    const uniqueLeaves = Array.from(new Map(dayLeaves.map(l => [l.id, l])).values());

    return (
      <div
        key={key}
        onClick={() => onSelectDate(day)}
        className={cn(
          "border-b border-r p-2 cursor-pointer transition-colors group/cell",
          "hover:bg-accent/30",
          isWeekView ? "min-h-[180px]" : "min-h-[100px]",
          !isWeekView && !inMonth && "opacity-30 bg-muted/10",
          weekend && inMonth && "bg-muted/20",
          dayIsToday && "bg-sky-50/60 dark:bg-sky-950/20",
          selectedDate && isSameDay(day, selectedDate) && "ring-2 ring-primary/40 ring-inset bg-primary/5"
        )}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span className={cn(
            "text-sm font-medium leading-none",
            dayIsToday && "bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center text-xs font-semibold",
            !dayIsToday && weekend && "text-muted-foreground/60"
          )}>
            {format(day, "d")}
          </span>
          <div className="flex items-center gap-1">
            {capacityWarning && <AlertTriangle className="h-3 w-3 text-amber-500" />}
            {uniqueLeaves.length > 0 && (
              <span className="text-[10px] text-muted-foreground font-medium">
                {uniqueLeaves.length}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-0.5">
          {uniqueLeaves.slice(0, maxVisible).map((l) => (
            <div key={l.id} className={cn(
              "text-[10px] leading-tight truncate rounded-sm px-1.5 py-0.5 flex items-center gap-1",
              getLeaveColor(l.leave_type),
              l.status === "submitted" && "opacity-70 border-dashed"
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", getStatusDot(l.status))} />
              <span className="truncate font-medium">
                {l.profiles?.full_name || "Employee"}
              </span>
              {l.duration_type !== "full_day" && (
                <span className="opacity-60 text-[9px]">{l.duration_type === "half_day_am" ? "AM" : "PM"}</span>
              )}
            </div>
          ))}
          {uniqueLeaves.length > maxVisible && (
            <div className="text-[10px] text-muted-foreground font-medium pl-1">+{uniqueLeaves.length - maxVisible} more</div>
          )}
        </div>
      </div>
    );
  };

  const dayHeaders = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between px-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-base font-semibold">{renderTitle()}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {dayHeaders.map((d, i) => (
              <div key={d} className={cn(
                "p-2.5 text-center text-xs font-medium text-muted-foreground",
                (i === 0 || i === 6) && "text-muted-foreground/50"
              )}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {(viewMode === "month" ? calendarDays : weekDays).map((day) => renderDayCell(day, viewMode === "week"))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
