import { useState, useMemo } from "react";
import { getBusinessTimeDiffMs } from "@/lib/sla-utils";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { SLACountdown } from "@/components/SLACountdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function DepartmentQueue() {
  const { user, managedDepartments, isSuperAdmin } = useAuth();
  const [selectedDept, setSelectedDept] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const visibleDepts = isSuperAdmin ? departments : departments?.filter((d) => managedDepartments.includes(d.id));

  // Fetch ticket IDs linked via ticket_departments junction table
  const { data: linkedTicketIds } = useQuery({
    queryKey: ["linked-ticket-ids", selectedDept, managedDepartments, isSuperAdmin],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("ticket_departments").select("ticket_id");
      if (selectedDept !== "all") {
        q = q.eq("department_id", selectedDept);
      } else if (!isSuperAdmin) {
        q = q.in("department_id", managedDepartments);
      }
      const { data, error } = await q;
      if (error) throw error;
      return [...new Set(data?.map((r) => r.ticket_id) || [])];
    },
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["dept-tickets", selectedDept, managedDepartments, isSuperAdmin, linkedTicketIds],
    enabled: !!user && linkedTicketIds !== undefined,
    queryFn: async () => {
      const selectStr = "*, departments(name, code), requester:profiles!tickets_requester_id_fkey(full_name), assignee:profiles!tickets_assignee_id_fkey(full_name)";

      if (selectedDept !== "all") {
        // Tickets where primary dept matches OR linked via junction
        const ids = linkedTicketIds || [];
        const orFilter = ids.length > 0
          ? `department_id.eq.${selectedDept},id.in.(${ids.join(",")})`
          : `department_id.eq.${selectedDept}`;
        const { data, error } = await supabase
          .from("tickets")
          .select(selectStr)
          .or(orFilter)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      } else if (!isSuperAdmin) {
        const ids = linkedTicketIds || [];
        const orParts = [`department_id.in.(${managedDepartments.join(",")})`];
        if (ids.length > 0) orParts.push(`id.in.(${ids.join(",")})`);
        const { data, error } = await supabase
          .from("tickets")
          .select(selectStr)
          .or(orParts.join(","))
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("tickets")
          .select(selectStr)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      }
    },
  });

  const priorityOrder: Record<string, number> = { critical: 0, normal: 1, low: 2 };

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !tickets) return tickets || [];
    return tickets.filter((t: any) =>
      (t.ticket_no && t.ticket_no.toLowerCase().includes(q)) ||
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.requester?.full_name && t.requester.full_name.toLowerCase().includes(q)) ||
      (t.assignee?.full_name && t.assignee.full_name.toLowerCase().includes(q)) ||
      (t.departments?.name && t.departments.name.toLowerCase().includes(q)) ||
      (t.departments?.code && t.departments.code.toLowerCase().includes(q)) ||
      (t.priority && t.priority.toLowerCase().includes(q)) ||
      (t.status && t.status.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }, [tickets, searchQuery]);

  const activeTickets = filteredTickets
    .filter((t) => t.status !== "closed" && t.status !== "for_review")
    .sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

  const resolvedClosedTickets = filteredTickets
    .filter((t) => t.status === "closed" || t.status === "for_review")
    .sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

  const openCount = activeTickets.length;
  const overdueCount = activeTickets.filter((t) => getBusinessTimeDiffMs(new Date(), new Date(t.sla_due_at)) <= 0).length;
  const criticalCount = activeTickets.filter((t) => t.priority === "critical").length;
  const resolvedClosedCount = resolvedClosedTickets.length;

  const renderRow = (t: any, greyscale = false) => (
    <TableRow key={t.id} className={greyscale ? "opacity-50" : ""}>
      <TableCell><Link to={`/tickets/${t.id}`} className={`font-mono text-xs hover:underline ${greyscale ? "text-muted-foreground" : "text-primary"}`}>{t.ticket_no}</Link></TableCell>
      <TableCell className="max-w-[200px] truncate"><Link to={`/tickets/${t.id}`} className="hover:underline">{t.title}</Link></TableCell>
      <TableCell className="text-sm">{t.requester?.full_name || "—"}</TableCell>
      <TableCell className="text-sm"><span className="flex items-center gap-1">👑 {t.assignee?.full_name || "Unassigned"}</span></TableCell>
      <TableCell><PriorityBadge priority={t.priority} /></TableCell>
      <TableCell><StatusBadge status={t.status} /></TableCell>
      <TableCell><SLACountdown slaDueAt={t.sla_due_at} slaBreachedAt={t.sla_breached_at} closedAt={t.closed_at} finalOverdueSeconds={t.final_overdue_seconds} status={t.status} /></TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.created_at!), { addSuffix: true })}</TableCell>
    </TableRow>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">Department Queue</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tickets, users, department…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Select value={selectedDept} onValueChange={setSelectedDept}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {visibleDepts?.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-9 w-16" /></CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Open Tickets</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{openCount}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Overdue</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-destructive">{overdueCount}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Critical</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-warning">{criticalCount}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Resolved / Closed</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-muted-foreground">{resolvedClosedCount}</p></CardContent>
            </Card>
          </>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Requester</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, r) => (
                <TableRow key={r}>
                  {Array.from({ length: 8 }).map((_, c) => (
                    <TableCell key={c}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : !tickets?.length ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No tickets</TableCell></TableRow>
            ) : (
              <>
                {activeTickets.map((t) => renderRow(t, false))}
                {resolvedClosedTickets.length > 0 && (
                  <>
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider py-2">
                        Resolved / Closed
                      </TableCell>
                    </TableRow>
                    {resolvedClosedTickets.map((t) => renderRow(t, true))}
                  </>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
