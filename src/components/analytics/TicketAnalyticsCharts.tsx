import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import type { TrendPoint, EmployeeMetrics, DepartmentMetrics } from "@/hooks/useTicketAnalytics";

const COLORS = [
  "hsl(217, 91%, 60%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)", "hsl(262, 83%, 58%)", "hsl(199, 89%, 48%)",
  "hsl(328, 85%, 57%)", "hsl(172, 66%, 50%)", "hsl(25, 95%, 53%)",
];

interface Props {
  trendData: TrendPoint[];
  employeeMetrics: EmployeeMetrics[];
  departmentMetrics: DepartmentMetrics[];
  dateMode: "created" | "resolved";
}

export default function TicketAnalyticsCharts({ trendData, employeeMetrics, departmentMetrics, dateMode }: Props) {
  const topByTickets = [...employeeMetrics].sort((a, b) => b.ticketsProcessed - a.ticketsProcessed).slice(0, 8);
  const topBySla = [...employeeMetrics].filter(e => e.slaEligible > 0).sort((a, b) => b.slaComplianceRate - a.slaComplianceRate).slice(0, 8);
  const deptPie = departmentMetrics.filter(d => d.totalTickets > 0);

  const trendLabel = dateMode === "resolved" ? "Resolved" : "Created";
  const trendConfig = { count: { label: trendLabel, color: "hsl(217, 91%, 60%)" }, resolved: { label: "Resolved", color: "hsl(142, 76%, 36%)" } };

  const hasCharts = trendData.length > 1 || topByTickets.length > 0 || deptPie.length > 0;

  if (!hasCharts) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Not enough data for trends</p>
        <p className="text-xs text-muted-foreground">Widen your date range or adjust filters to see trend charts.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tickets Over Time ({trendLabel} Date)</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={trendConfig} className="h-[220px] w-full">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="resolved" stroke="var(--color-resolved)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">SLA Compliance Trend</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ slaRate: { label: "SLA %", color: "hsl(142, 76%, 36%)" } }} className="h-[220px] w-full">
              <LineChart data={trendData.map(t => ({ ...t, slaRate: t.slaEligible ? Math.round((t.slaMet / t.slaEligible) * 100) : 0 }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="slaRate" stroke="var(--color-slaRate)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {topByTickets.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Performers — Tickets Processed</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ tickets: { label: "Tickets", color: "hsl(217, 91%, 60%)" } }} className="h-[220px] w-full">
              <BarChart data={topByTickets.map(e => ({ name: e.fullName.split(" ")[0], tickets: e.ticketsProcessed }))} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="tickets" fill="var(--color-tickets)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {deptPie.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tickets by Department</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-center">
            <ChartContainer config={Object.fromEntries(deptPie.map((d, i) => [d.departmentName, { label: d.departmentName, color: COLORS[i % COLORS.length] }]))} className="h-[220px] w-full">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                <Pie data={deptPie.map(d => ({ name: d.departmentName, value: d.totalTickets }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                  {deptPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {topBySla.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top Performers — SLA Compliance</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ sla: { label: "SLA %", color: "hsl(142, 76%, 36%)" } }} className="h-[220px] w-full">
              <BarChart data={topBySla.map(e => ({ name: e.fullName.split(" ")[0], sla: Math.round(e.slaComplianceRate) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="sla" fill="var(--color-sla)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
