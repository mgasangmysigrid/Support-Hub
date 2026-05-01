import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, CheckCircle, Clock, AlertTriangle, ShieldCheck, Inbox } from "lucide-react";

interface SummaryMetrics {
  totalTickets: number;
  resolved: number;
  resolutionRate: number;
  slaComplianceRate: number;
  avgResolutionHours: number;
  openTickets: number;
  breachedTickets: number;
  isResolvedMode: boolean;
}

function formatHours(h: number): string {
  if (h === 0) return "0h";
  if (h < 24) return `${h.toFixed(1)}h`;
  const days = Math.floor(h / 24);
  const rem = h % 24;
  return `${days}d ${rem.toFixed(0)}h`;
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function TicketAnalyticsSummary({ metrics }: { metrics: SummaryMetrics | null }) {
  if (!metrics) return null;

  // In resolved mode, replace "Open Tickets" with "Resolved Tickets"
  const cards = [
    { key: "totalTickets", label: "Total Tickets", icon: BarChart3, color: "text-primary" },
    { key: "resolutionRate", label: "Resolution Rate", icon: CheckCircle, color: "text-green-600", pct: true },
    { key: "slaComplianceRate", label: "SLA Compliance", icon: ShieldCheck, color: "text-blue-600", pct: true },
    { key: "avgResolutionHours", label: "Avg Resolution Time", icon: Clock, color: "text-amber-600", hours: true },
    ...(metrics.isResolvedMode
      ? [{ key: "resolved" as const, label: "Resolved Tickets", icon: CheckCircle, color: "text-green-600" }]
      : [{ key: "openTickets" as const, label: "Open Tickets", icon: Inbox, color: "text-orange-500" }]),
    { key: "breachedTickets", label: "Breached Tickets", icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => {
        const raw = metrics[c.key as keyof SummaryMetrics];
        let display: string;
        if ("pct" in c && c.pct) display = `${(raw as number).toFixed(1)}%`;
        else if ("hours" in c && c.hours) display = formatHours(raw as number);
        else display = String(raw);

        return (
          <Card key={c.key} className="border">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <c.icon className={cn("h-4 w-4", c.color)} />
                <span className="text-xs text-muted-foreground font-medium">{c.label}</span>
              </div>
              <span className="text-2xl font-bold tracking-tight">{display}</span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
