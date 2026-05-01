import { cn } from "@/lib/utils";
import { Clock, AlertTriangle, CheckCircle2, Timer, AlertCircle } from "lucide-react";
import { computeSlaStatus, formatOverdueDuration, formatRemainingTime, type SlaStatus } from "@/lib/sla-utils";
import { useEffect, useState } from "react";

interface SLACountdownProps {
  slaDueAt: string | null;
  slaBreachedAt?: string | null;
  closedAt?: string | null;
  finalOverdueSeconds?: number | null;
  status?: string;
  /** Show compact version (badge only) vs expanded */
  compact?: boolean;
}

export function SLACountdown({
  slaDueAt,
  slaBreachedAt = null,
  closedAt = null,
  finalOverdueSeconds = null,
  status = "open",
  compact = true,
}: SLACountdownProps) {
  const [now, setNow] = useState(Date.now());

  // Tick every 30s for live updates on open tickets
  const isClosed = status === "closed" || status === "for_review";
  useEffect(() => {
    if (isClosed || !slaDueAt) return;
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [isClosed, slaDueAt]);

  const sla = computeSlaStatus(slaDueAt, closedAt, slaBreachedAt ?? null, finalOverdueSeconds ?? null, status);

  return <SLABadge sla={sla} compact={compact} />;
}

function SLABadge({ sla, compact }: { sla: SlaStatus; compact: boolean }) {
  switch (sla.label) {
    case "no_due_date":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-3 w-3" /> No due date
        </span>
      );

    case "resolved_on_time":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" /> Resolved on time
        </span>
      );

    case "resolved_late":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
          <AlertCircle className="h-3 w-3" />
          {compact
            ? `Late ${formatOverdueDuration(sla.overdueSeconds)}`
            : `Resolved ${formatOverdueDuration(sla.overdueSeconds)} overdue`}
        </span>
      );

    case "overdue":
    case "breached":
      return (
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-destructive",
          sla.severity === "critical"
            ? "bg-destructive/20 animate-pulse"
            : sla.severity === "moderate"
            ? "bg-destructive/15"
            : "bg-destructive/10",
        )}>
          <AlertTriangle className="h-3 w-3" />
          Overdue {formatOverdueDuration(sla.overdueSeconds)}
        </span>
      );

    case "due_soon":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
          <Timer className="h-3 w-3" />
          Due in {formatRemainingTime(sla.remainingMs!)}
        </span>
      );

    case "on_time":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-3 w-3" />
          {formatRemainingTime(sla.remainingMs!)} left
        </span>
      );

    default:
      return null;
  }
}
