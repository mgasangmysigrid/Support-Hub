import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { Search, ArrowUpDown, Eye, PlusCircle, Wallet, Clock, AlertTriangle, DollarSign } from "lucide-react";

type SortField = "name" | "balance" | "last_activity";
type SortDir = "asc" | "desc";

type EmployeeBalance = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
  schedule_id: string | null;
  department: string | null;
  department_id: string | null;
  available: number;
  pending: number;
  usedYTD: number;
  accruedYTD: number;
  lastActivity: string | null;
};

type LedgerRow = {
  id: string;
  created_at: string;
  entry_type: string;
  hours: number;
  remaining_hours: number | null;
  notes: string | null;
  related_request_id: string | null;
  expires_at: string | null;
  earned_at: string | null;
  created_by_name: string | null;
};

export default function AdminLeaveCredits() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeBalance | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<EmployeeBalance | null>(null);
  const [adjHours, setAdjHours] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [adjExpiry, setAdjExpiry] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  // Fetch all profiles
  const { data: profiles } = useQuery({
    queryKey: ["admin-credits-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, is_active, schedule_id")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch departments + members
  const { data: departments } = useQuery({
    queryKey: ["admin-credits-departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("display_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: deptMembers } = useQuery({
    queryKey: ["admin-credits-dept-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("user_id, department_id, departments(name)");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all PTO ledger entries
  const { data: allLedger } = useQuery({
    queryKey: ["admin-credits-all-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pto_ledger")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch pending leave requests
  const { data: pendingRequests } = useQuery({
    queryKey: ["admin-credits-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("user_id, total_hours")
        .eq("leave_type", "paid_pto")
        .eq("status", "submitted");
      if (error) throw error;
      return data;
    },
  });

  // Fetch schedules for PTO profile display
  const { data: schedules } = useQuery({
    queryKey: ["admin-credits-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schedules").select("id, name");
      if (error) throw error;
      return data;
    },
  });

  // Build employee balances
  const employeeBalances = useMemo<EmployeeBalance[]>(() => {
    if (!profiles || !allLedger) return [];
    const today = new Date().toISOString().split("T")[0];
    const yearStart = `${new Date().getFullYear()}-01-01`;

    const userDeptMap = new Map<string, { name: string | null; id: string | null }>();
    deptMembers?.forEach((dm: any) => {
      if (!userDeptMap.has(dm.user_id)) {
        userDeptMap.set(dm.user_id, {
          name: dm.departments?.name || null,
          id: dm.department_id,
        });
      }
    });

    const pendingMap = new Map<string, number>();
    pendingRequests?.forEach((r) => {
      pendingMap.set(r.user_id, (pendingMap.get(r.user_id) || 0) + Number(r.total_hours));
    });

    return profiles.map((p) => {
      const entries = allLedger.filter((e) => e.user_id === p.id);
      let available = 0;
      let usedYTD = 0;
      let accruedYTD = 0;
      let lastActivity: string | null = null;

      for (const e of entries) {
        const hrs = Number(e.hours) || 0;
        const remHrs = Number(e.remaining_hours ?? e.hours) || 0;
        if (e.entry_type === "accrual") {
          const isExpired = e.expires_at && e.expires_at <= today;
          if (!isExpired) available += remHrs;
          if (e.created_at >= yearStart) accruedYTD += hrs;
        } else if (e.entry_type === "deduction") {
          if (e.created_at >= yearStart) usedYTD += Math.abs(hrs);
        } else if (e.entry_type === "adjustment") {
          available += remHrs;
        } else if (e.entry_type === "reversal") {
          available += hrs;
        }
        if (!lastActivity || e.created_at > lastActivity) lastActivity = e.created_at;
      }

      const dept = userDeptMap.get(p.id);
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        is_active: p.is_active,
        schedule_id: p.schedule_id,
        department: dept?.name || null,
        department_id: dept?.id || null,
        available: Math.max(0, available),
        pending: pendingMap.get(p.id) || 0,
        usedYTD,
        accruedYTD,
        lastActivity,
      };
    });
  }, [profiles, allLedger, deptMembers, pendingRequests]);

  // Filtered + sorted
  const filteredEmployees = useMemo(() => {
    let list = employeeBalances;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) => (e.full_name || "").toLowerCase().includes(q) || (e.email || "").toLowerCase().includes(q)
      );
    }
    if (deptFilter !== "all") {
      list = list.filter((e) => e.department_id === deptFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((e) => (statusFilter === "active" ? e.is_active : !e.is_active));
    }
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = (a.full_name || "").localeCompare(b.full_name || "");
      else if (sortField === "balance") cmp = a.available - b.available;
      else if (sortField === "last_activity") cmp = (a.lastActivity || "").localeCompare(b.lastActivity || "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [employeeBalances, search, deptFilter, statusFilter, sortField, sortDir]);

  // Summary cards
  const totalAvailable = employeeBalances.filter((e) => e.is_active).reduce((s, e) => s + e.available, 0);
  const totalPending = employeeBalances.filter((e) => e.is_active).reduce((s, e) => s + e.pending, 0);
  const lowBalanceCount = employeeBalances.filter((e) => e.is_active && e.available < 16).length;
  const totalLiability = totalAvailable + totalPending;

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const formatHrs = (h: number) => {
    const days = h / 8;
    return `${days.toFixed(1)}d (${h.toFixed(1)}h)`;
  };

  // ─── Ledger for selected employee ───
  const { data: ledgerData } = useQuery({
    queryKey: ["admin-credits-ledger", selectedEmployee?.id],
    enabled: !!selectedEmployee,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pto_ledger")
        .select("*, creator:profiles!pto_ledger_created_by_fkey(full_name)")
        .eq("user_id", selectedEmployee!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((e: any) => ({
        id: e.id,
        created_at: e.created_at,
        entry_type: e.entry_type,
        hours: e.hours,
        remaining_hours: e.remaining_hours,
        notes: e.notes,
        related_request_id: e.related_request_id,
        expires_at: e.expires_at,
        earned_at: e.earned_at,
        created_by_name: e.creator?.full_name || null,
      })) as LedgerRow[];
    },
  });

  const entryTypeLabel = (t: string) => {
    const map: Record<string, { label: string; color: string }> = {
      accrual: { label: "ACCRUAL", color: "bg-emerald-500/10 text-emerald-600" },
      deduction: { label: "LEAVE_APPROVED", color: "bg-red-500/10 text-red-600" },
      adjustment: { label: "MANUAL_ADJUSTMENT", color: "bg-blue-500/10 text-blue-600" },
      reversal: { label: "LEAVE_CANCELLED", color: "bg-amber-500/10 text-amber-600" },
      expired: { label: "EXPIRED", color: "bg-muted text-muted-foreground" },
    };
    return map[t] || { label: t.toUpperCase(), color: "bg-muted text-muted-foreground" };
  };

  // Compute running balance for ledger
  const ledgerWithBalance = useMemo(() => {
    if (!ledgerData) return [];
    // Reverse to chronological, compute running balance, then reverse back
    const chronological = [...ledgerData].reverse();
    let balance = 0;
    const result = chronological.map((e) => {
      const hrs = Number(e.hours) || 0;
      if (e.entry_type === "accrual" || e.entry_type === "adjustment" || e.entry_type === "reversal") {
        balance += hrs;
      } else if (e.entry_type === "deduction" || e.entry_type === "expired") {
        balance += hrs; // these are negative
      }
      return { ...e, balanceAfter: balance };
    });
    return result.reverse();
  }, [ledgerData]);

  // ─── Adjust balance ───
  const handleAdjustment = async () => {
    if (!adjustTarget || !adjHours || !adjReason) {
      toast.error("All fields are required");
      return;
    }
    setAdjusting(true);
    try {
      const hours = parseFloat(adjHours);
      const { error } = await supabase.from("pto_ledger").insert({
        user_id: adjustTarget.id,
        entry_type: "adjustment",
        hours,
        remaining_hours: hours > 0 ? hours : null,
        earned_at: new Date().toISOString().split("T")[0],
        expires_at: adjExpiry || null,
        created_by: user!.id,
        notes: adjReason,
      });
      if (error) throw error;

      await supabase.from("leave_audit_log").insert({
        actor_id: user!.id,
        entity_type: "pto_adjustment",
        entity_id: adjustTarget.id,
        action: "pto_adjustment",
        after_snapshot: { hours, reason: adjReason, expiry: adjExpiry || null },
        notes: adjReason,
      });

      toast.success("PTO adjustment applied");
      setShowAdjust(false);
      setAdjHours("");
      setAdjReason("");
      setAdjExpiry("");
      setAdjustTarget(null);
      queryClient.invalidateQueries({ queryKey: ["admin-credits-all-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["admin-credits-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["pto-balance"] });
      queryClient.invalidateQueries({ queryKey: ["pto-ledger"] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Wallet className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total PTO Available</p>
              <p className="text-lg font-semibold">{formatHrs(totalAvailable)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total PTO Pending</p>
              <p className="text-lg font-semibold">{formatHrs(totalPending)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Low Balance (&lt;2d)</p>
              <p className="text-lg font-semibold">{lowBalanceCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Leave Liability</p>
              <p className="text-lg font-semibold">{formatHrs(totalLiability)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments?.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground ml-auto">{filteredEmployees.length} employees</p>
      </div>

      {/* Employee Balance Table */}
      <div className="rounded-lg border bg-card overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("name")}>
                  Employee <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Department</TableHead>
              <TableHead>PTO Profile</TableHead>
              <TableHead>
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("balance")}>
                  Current Balance <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Used YTD</TableHead>
              <TableHead>Pending</TableHead>
              <TableHead>Accrued YTD</TableHead>
              <TableHead>
                <button className="flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("last_activity")}>
                  Last Activity <ArrowUpDown className="h-3 w-3" />
                </button>
              </TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">No employees found</TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((emp) => {
                const schedName = schedules?.find((s) => s.id === emp.schedule_id)?.name || "Default";
                return (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedEmployee(emp)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{emp.full_name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{emp.department || "—"}</TableCell>
                    <TableCell className="text-sm">{schedName}</TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${emp.available < 16 ? "text-red-600" : ""}`}>
                        {formatHrs(emp.available)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{formatHrs(emp.usedYTD)}</TableCell>
                    <TableCell className="text-sm">{emp.pending > 0 ? formatHrs(emp.pending) : "—"}</TableCell>
                    <TableCell className="text-sm">{formatHrs(emp.accruedYTD)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {emp.lastActivity ? format(new Date(emp.lastActivity), "MMM d, yyyy") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`border-0 ${emp.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                        {emp.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" title="View Ledger" onClick={() => setSelectedEmployee(emp)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Adjust Balance"
                          onClick={() => {
                            setAdjustTarget(emp);
                            setShowAdjust(true);
                          }}
                        >
                          <PlusCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── Ledger Sheet ─── */}
      <Sheet open={!!selectedEmployee} onOpenChange={(open) => !open && setSelectedEmployee(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              PTO Ledger — {selectedEmployee?.full_name || selectedEmployee?.email}
            </SheetTitle>
            <div className="flex gap-3 mt-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Balance: </span>
                <span className="font-medium">{formatHrs(selectedEmployee?.available || 0)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Pending: </span>
                <span className="font-medium">{formatHrs(selectedEmployee?.pending || 0)}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Used YTD: </span>
                <span className="font-medium">{formatHrs(selectedEmployee?.usedYTD || 0)}</span>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-4">
            <div className="flex justify-end mb-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (selectedEmployee) {
                    setAdjustTarget(selectedEmployee);
                    setShowAdjust(true);
                  }
                }}
              >
                <PlusCircle className="h-4 w-4 mr-1" /> Adjust Balance
              </Button>
            </div>
            <div className="rounded-lg border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Hours (+/-)</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Balance After</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerWithBalance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">No ledger entries</TableCell>
                    </TableRow>
                  ) : (
                    ledgerWithBalance.map((entry) => {
                      const { label, color } = entryTypeLabel(entry.entry_type);
                      const isPositive = entry.hours > 0;
                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {format(new Date(entry.created_at), "MMM d, yyyy")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`border-0 text-[10px] ${color}`}>{label}</Badge>
                          </TableCell>
                          <TableCell className={`text-right text-sm font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                            {isPositive ? "+" : ""}{entry.hours}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {entry.related_request_id ? `Leave #${entry.related_request_id.slice(0, 8)}` : entry.earned_at ? `Earned ${entry.earned_at}` : "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm">{entry.balanceAfter.toFixed(1)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={entry.notes || ""}>
                            {entry.notes || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{entry.created_by_name || "System"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Adjust Balance Dialog ─── */}
      <Dialog open={showAdjust} onOpenChange={(open) => { if (!open) { setShowAdjust(false); setAdjustTarget(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust PTO Balance</DialogTitle>
            <DialogDescription>
              {adjustTarget ? `Adjusting balance for ${adjustTarget.full_name || adjustTarget.email}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Hours (+/-)</Label>
              <Input type="number" value={adjHours} onChange={(e) => setAdjHours(e.target.value)} placeholder="e.g. 8 or -16" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason (required)</Label>
              <Textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="Reason for adjustment..." rows={2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expiry Date (optional)</Label>
              <Input type="date" value={adjExpiry} onChange={(e) => setAdjExpiry(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdjust(false); setAdjustTarget(null); }}>Cancel</Button>
            <Button onClick={handleAdjustment} disabled={adjusting || !adjHours || !adjReason}>
              {adjusting ? "Applying..." : "Apply Adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
