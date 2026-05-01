import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Inbox } from "lucide-react";
import type { DepartmentMetrics, EmployeeMetrics } from "@/hooks/useTicketAnalytics";
import DepartmentDrillDown from "./DepartmentDrillDown";

function formatHours(h: number): string {
  if (h === 0) return "—";
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.floor(h / 24)}d ${(h % 24).toFixed(0)}h`;
}

function rateBadge(val: number) {
  const cls = val >= 80 ? "border-green-500 text-green-700 bg-green-50" : val >= 50 ? "border-amber-500 text-amber-700 bg-amber-50" : "border-destructive text-destructive bg-red-50";
  return <Badge variant="outline" className={cls}>{val.toFixed(1)}%</Badge>;
}

export default function DepartmentSummaryTable({ data, employeeMetrics }: { data: DepartmentMetrics[]; employeeMetrics: EmployeeMetrics[] }) {
  const [selectedDept, setSelectedDept] = useState<DepartmentMetrics | null>(null);

  if (!data.length) {
    return (
      <div className="text-center py-12 space-y-2">
        <div className="flex justify-center"><div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center"><Inbox className="h-5 w-5 text-muted-foreground" /></div></div>
        <p className="text-sm font-medium text-muted-foreground">No department data found</p>
        <p className="text-xs text-muted-foreground">No tickets are visible for the departments within your access scope.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">Department Summary</h3>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-xs">Department</TableHead>
              <TableHead className="text-xs">Total</TableHead>
              <TableHead className="text-xs">Resolution %</TableHead>
              <TableHead className="text-xs">SLA %</TableHead>
              <TableHead className="text-xs">Avg Res. Time</TableHead>
              <TableHead className="text-xs">Open</TableHead>
              <TableHead className="text-xs">Breached</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(d => (
              <TableRow key={d.departmentId} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setSelectedDept(d)}>
                <TableCell className="font-medium text-sm">{d.departmentName}</TableCell>
                <TableCell className="font-semibold">{d.totalTickets}</TableCell>
                <TableCell>{rateBadge(d.resolutionRate)}</TableCell>
                <TableCell>{rateBadge(d.slaComplianceRate)}</TableCell>
                <TableCell className="text-xs">{formatHours(d.avgResolutionHours)}</TableCell>
                <TableCell>{d.openTickets}</TableCell>
                <TableCell>
                  {d.breachedTickets > 0 ? (
                    <Badge variant="destructive" className="text-xs">{d.breachedTickets}</Badge>
                  ) : <span className="text-muted-foreground">0</span>}
                </TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DepartmentDrillDown
        department={selectedDept}
        employees={employeeMetrics}
        open={!!selectedDept}
        onClose={() => setSelectedDept(null)}
      />
    </div>
  );
}
