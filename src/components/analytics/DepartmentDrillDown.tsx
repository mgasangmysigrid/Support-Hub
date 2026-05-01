import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, CheckCircle, ShieldCheck, Clock, AlertTriangle, Inbox } from "lucide-react";
import type { DepartmentMetrics, EmployeeMetrics } from "@/hooks/useTicketAnalytics";

function formatHours(h: number): string {
  if (h === 0) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.floor(h / 24)}d ${(h % 24).toFixed(0)}h`;
}

function rateBadge(val: number) {
  const cls = val >= 80 ? "border-green-500 text-green-700" : val >= 50 ? "border-amber-500 text-amber-700" : "border-destructive text-destructive";
  return <Badge variant="outline" className={cls}>{val.toFixed(1)}%</Badge>;
}

interface Props {
  department: DepartmentMetrics | null;
  employees: EmployeeMetrics[];
  open: boolean;
  onClose: () => void;
}

export default function DepartmentDrillDown({ department, employees, open, onClose }: Props) {
  if (!department) return null;

  const d = department;
  const deptEmployees = employees.filter(e => e.departmentId === d.departmentId);

  const cards = [
    { label: "Total Tickets", value: d.totalTickets, icon: BarChart3, color: "text-primary" },
    { label: "Resolved", value: d.resolved, icon: CheckCircle, color: "text-green-600" },
    { label: "Resolution %", value: `${d.resolutionRate.toFixed(1)}%`, icon: CheckCircle, color: "text-green-600" },
    { label: "SLA %", value: `${d.slaComplianceRate.toFixed(1)}%`, icon: ShieldCheck, color: "text-blue-600" },
    { label: "Avg Res. Time", value: formatHours(d.avgResolutionHours), icon: Clock, color: "text-amber-600" },
    { label: "Open", value: d.openTickets, icon: Inbox, color: "text-orange-500" },
    { label: "Breached", value: d.breachedTickets, icon: AlertTriangle, color: "text-destructive" },
  ];

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-[75vw] lg:max-w-[1200px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{d.departmentName}</SheetTitle>
          <p className="text-xs text-muted-foreground">Department Summary</p>
        </SheetHeader>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-4">
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

        <h4 className="text-sm font-semibold mt-5 mb-2">Employee Breakdown</h4>
        {deptEmployees.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No employees with tickets in this department.</p>
        ) : (
          <div className="rounded-lg border overflow-hidden" style={{ maxHeight: "calc(100vh - 380px)" }}>
            <div className="overflow-auto h-full">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="text-xs">Employee</TableHead>
                    <TableHead className="text-xs">Processed</TableHead>
                    <TableHead className="text-xs">Resolved</TableHead>
                    <TableHead className="text-xs">Res %</TableHead>
                    <TableHead className="text-xs">SLA %</TableHead>
                    <TableHead className="text-xs">Open</TableHead>
                    <TableHead className="text-xs">Breached</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptEmployees.map(e => (
                    <TableRow key={e.userId} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="text-xs font-medium">{e.fullName}</TableCell>
                      <TableCell className="font-semibold text-xs">{e.ticketsProcessed}</TableCell>
                      <TableCell className="text-xs">{e.resolved}</TableCell>
                      <TableCell>{rateBadge(e.resolutionRate)}</TableCell>
                      <TableCell>{rateBadge(e.slaComplianceRate)}</TableCell>
                      <TableCell className="text-xs">{e.openTickets}</TableCell>
                      <TableCell>
                        {e.breachedTickets > 0 ? (
                          <Badge variant="destructive" className="text-[10px]">{e.breachedTickets}</Badge>
                        ) : <span className="text-muted-foreground text-xs">0</span>}
                      </TableCell>
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
