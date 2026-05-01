import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle, Clock, AlertTriangle, ShieldCheck, Inbox, RotateCcw } from "lucide-react";
import type { EmployeeMetrics, TicketRow } from "@/hooks/useTicketAnalytics";
import { format } from "date-fns";

function formatHours(h: number): string {
  if (h === 0) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.floor(h / 24)}d ${(h % 24).toFixed(0)}h`;
}

function slaLabel(t: TicketRow) {
  if (!t.sla_due_at) return <Badge variant="outline" className="text-[10px]">No SLA</Badge>;
  if (t.sla_breached_at) return <Badge variant="destructive" className="text-[10px]">Breached</Badge>;
  return <Badge className="bg-green-600 hover:bg-green-600 text-[10px]">Met</Badge>;
}

function TicketList({ tickets, title, onOpen }: { tickets: TicketRow[]; title: string; onOpen: (id: string) => void }) {
  if (!tickets.length) return <p className="text-sm text-muted-foreground py-4 text-center">No {title.toLowerCase()} tickets.</p>;
  return (
    <div className="rounded-lg border overflow-hidden flex flex-col" style={{ maxHeight: "calc(100vh - 380px)" }}>
      <div className="overflow-auto flex-1">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow>
              <TableHead className="text-xs">Ticket #</TableHead>
              <TableHead className="text-xs min-w-[200px]">Title</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Priority</TableHead>
              <TableHead className="text-xs">Created</TableHead>
              <TableHead className="text-xs">Closed</TableHead>
              <TableHead className="text-xs">SLA</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map(t => (
              <TableRow key={t.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => onOpen(t.id)}>
                <TableCell className="text-xs font-mono text-primary underline whitespace-nowrap">{t.ticket_no}</TableCell>
                <TableCell className="text-xs max-w-[300px]">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild><span className="truncate block">{t.title}</span></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs"><p className="text-xs">{t.title}</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] capitalize whitespace-nowrap">{t.status.replace("_", " ")}</Badge></TableCell>
                <TableCell><Badge variant="outline" className="text-[10px] capitalize">{t.priority}</Badge></TableCell>
                <TableCell className="text-xs whitespace-nowrap">{t.created_at ? format(new Date(t.created_at), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{t.closed_at ? format(new Date(t.closed_at), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell>{slaLabel(t)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface Props {
  employee: EmployeeMetrics | null;
  open: boolean;
  onClose: () => void;
}

export default function EmployeeDrillDown({ employee, open, onClose }: Props) {
  if (!employee) return null;

  const e = employee;
  const closedTickets = e.tickets.filter(t => t.status === "closed");
  const openTickets = e.tickets.filter(t => ["open", "in_progress", "blocked", "for_review"].includes(t.status));
  const breachedTickets = e.tickets.filter(t => !!t.sla_due_at && !!t.sla_breached_at);
  const reopenedTickets = e.tickets.filter(t => t.reopened_count > 0);

  const handleOpen = (ticketId: string) => {
    window.open(`/tickets/${ticketId}`, "_blank", "noopener,noreferrer");
  };

  const cards = [
    { label: "Processed", value: e.ticketsProcessed, icon: Inbox, color: "text-primary" },
    { label: "Resolved", value: e.resolved, icon: CheckCircle, color: "text-green-600" },
    { label: "Resolution %", value: `${e.resolutionRate.toFixed(1)}%`, icon: CheckCircle, color: "text-green-600" },
    { label: "SLA %", value: `${e.slaComplianceRate.toFixed(1)}%`, icon: ShieldCheck, color: "text-blue-600" },
    { label: "Avg Res. Time", value: formatHours(e.avgResolutionHours), icon: Clock, color: "text-amber-600" },
    { label: "Avg 1st Resp.", value: formatHours(e.avgFirstResponseHours), icon: Clock, color: "text-amber-500" },
    { label: "Open", value: e.openTickets, icon: Inbox, color: "text-orange-500" },
    { label: "Breached", value: e.breachedTickets, icon: AlertTriangle, color: "text-destructive" },
    { label: "Reopened", value: e.reopenedTickets, icon: RotateCcw, color: "text-purple-600" },
  ];

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[75vw] lg:max-w-[1200px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{e.fullName}</SheetTitle>
          <p className="text-xs text-muted-foreground">{e.departmentName}</p>
        </SheetHeader>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2 mt-4">
          {cards.map(c => (
            <Card key={c.label} className="border">
              <CardContent className="p-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <c.icon className={`h-3.5 w-3.5 ${c.color}`} />
                  <span className="text-[10px] text-muted-foreground">{c.label}</span>
                </div>
                <span className="text-lg font-bold">{c.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="all" className="mt-4">
          <TabsList className="w-full">
            <TabsTrigger value="all" className="text-xs flex-1">All ({e.tickets.length})</TabsTrigger>
            <TabsTrigger value="closed" className="text-xs flex-1">Closed ({closedTickets.length})</TabsTrigger>
            <TabsTrigger value="open" className="text-xs flex-1">Open ({openTickets.length})</TabsTrigger>
            <TabsTrigger value="breached" className="text-xs flex-1">Breached ({breachedTickets.length})</TabsTrigger>
            <TabsTrigger value="reopened" className="text-xs flex-1">Reopened ({reopenedTickets.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all"><TicketList tickets={e.tickets} title="All" onOpen={handleOpen} /></TabsContent>
          <TabsContent value="closed"><TicketList tickets={closedTickets} title="Closed" onOpen={handleOpen} /></TabsContent>
          <TabsContent value="open"><TicketList tickets={openTickets} title="Open" onOpen={handleOpen} /></TabsContent>
          <TabsContent value="breached"><TicketList tickets={breachedTickets} title="Breached" onOpen={handleOpen} /></TabsContent>
          <TabsContent value="reopened"><TicketList tickets={reopenedTickets} title="Reopened" onOpen={handleOpen} /></TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
