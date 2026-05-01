import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, Clock, ChevronLeft, ChevronDown, ChevronRight, Users, FileText, Filter, UserCheck } from "lucide-react";
import { format } from "date-fns";

interface PolicyDoc {
  id: string;
  title: string;
  document_version: number;
  updated_at: string;
  category: string;
  visibility_type?: string;
}

// ─── Shared data hooks ───

function usePolicyData() {
  const { data: policyDocs = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["policy-ack-docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base")
        .select("id, title, document_version, updated_at, category, visibility_type")
        .eq("requires_acknowledgment", true)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as PolicyDoc[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["policy-ack-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: deptMembers = [] } = useQuery({
    queryKey: ["policy-ack-dept-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("department_members")
        .select("user_id, department_id, department:departments(name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: kbDeptLinks = [] } = useQuery({
    queryKey: ["policy-ack-kb-dept-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_base_departments")
        .select("knowledge_base_id, department_id");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allAcks = [] } = useQuery({
    queryKey: ["policy-ack-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_document_acknowledgments")
        .select("document_id, user_id, document_version, acknowledged_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const departments = useMemo(() =>
    Array.from(new Set(
      deptMembers.map((dm: any) => dm.department?.name).filter(Boolean)
    )).sort() as string[],
    [deptMembers]
  );

  const getDeptForUser = (userId: string) => {
    const dm = deptMembers.find((d: any) => d.user_id === userId);
    return (dm as any)?.department?.name ?? "Unassigned";
  };

  const getEligibleEmployees = (doc: PolicyDoc) => {
    if (!doc.visibility_type || doc.visibility_type === "all") return employees;
    const linkedDeptIds = kbDeptLinks
      .filter((l) => l.knowledge_base_id === doc.id)
      .map((l) => l.department_id);
    if (linkedDeptIds.length === 0) return [];
    const eligibleUserIds = new Set(
      deptMembers
        .filter((dm: any) => linkedDeptIds.includes(dm.department_id))
        .map((dm: any) => dm.user_id)
    );
    return employees.filter((e) => eligibleUserIds.has(e.id));
  };

  return { policyDocs, loadingDocs, employees, deptMembers, kbDeptLinks, allAcks, departments, getDeptForUser, getEligibleEmployees };
}

// ─── Document-level drilldown (unchanged logic) ───

function DocDrillDown({
  selectedDoc, onBack, allAcks, getEligibleEmployees, getDeptForUser, departments,
}: {
  selectedDoc: PolicyDoc;
  onBack: () => void;
  allAcks: any[];
  getEligibleEmployees: (doc: PolicyDoc) => any[];
  getDeptForUser: (userId: string) => string;
  departments: string[];
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  const eligible = getEligibleEmployees(selectedDoc);
  const docAcks = allAcks.filter(
    (a) => a.document_id === selectedDoc.id && a.document_version === selectedDoc.document_version
  );
  const ackMap = new Map(docAcks.map((a) => [a.user_id, a.acknowledged_at]));

  let filteredEmployees = eligible.map((e) => ({
    ...e,
    dept: getDeptForUser(e.id),
    acked: ackMap.has(e.id),
    ackedAt: ackMap.get(e.id) ?? null,
  }));

  if (statusFilter === "acknowledged") filteredEmployees = filteredEmployees.filter((e) => e.acked);
  if (statusFilter === "pending") filteredEmployees = filteredEmployees.filter((e) => !e.acked);
  if (deptFilter !== "all") filteredEmployees = filteredEmployees.filter((e) => e.dept === deptFilter);

  filteredEmployees.sort((a, b) => {
    if (a.acked !== b.acked) return a.acked ? 1 : -1;
    return (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });

  const total = eligible.length;
  const totalAcked = eligible.filter((e) => ackMap.has(e.id)).length;
  const rate = total > 0 ? Math.round((totalAcked / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ChevronLeft className="h-4 w-4 mr-1" /> Back to Overview
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            {selectedDoc.title}
            <Badge variant="outline" className="text-xs ml-2">v{selectedDoc.document_version}</Badge>
            {selectedDoc.visibility_type === "department_specific" && (
              <Badge variant="outline" className="text-xs">Dept-specific</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-xs text-muted-foreground">Total Required</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{totalAcked}</p>
              <p className="text-xs text-muted-foreground">Acknowledged</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{total - totalAcked}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{rate}%</p>
              <p className="text-xs text-muted-foreground">Completion</p>
            </div>
          </div>
          <Progress value={rate} className="h-2" />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Acknowledged At</TableHead>
              <TableHead>Version</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.full_name || emp.email || "Unknown"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{emp.dept}</TableCell>
                <TableCell>
                  {emp.acked ? (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs border">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Acknowledged
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs border">
                      <Clock className="h-3 w-3 mr-1" /> Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {emp.ackedAt ? format(new Date(emp.ackedAt), "PPp") : "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {emp.acked ? `v${selectedDoc.document_version}` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Compliance Per User section ───

function CompliancePerUser({
  policyDocs, employees, allAcks, getEligibleEmployees, getDeptForUser,
}: {
  policyDocs: PolicyDoc[];
  employees: any[];
  allAcks: any[];
  getEligibleEmployees: (doc: PolicyDoc) => any[];
  getDeptForUser: (userId: string) => string;
}) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const userCompliance = useMemo(() => {
    // For each employee, determine which docs target them and which they've acked
    const ackSet = new Set(allAcks.map((a) => `${a.user_id}:${a.document_id}:${a.document_version}`));

    return employees.map((emp) => {
      const targetedDocs = policyDocs.filter((doc) => {
        const eligible = getEligibleEmployees(doc);
        return eligible.some((e) => e.id === emp.id);
      });

      const total = targetedDocs.length;
      const acknowledged = targetedDocs.filter((doc) =>
        ackSet.has(`${emp.id}:${doc.id}:${doc.document_version}`)
      ).length;
      const pending = total - acknowledged;
      const rate = total > 0 ? Math.round((acknowledged / total) * 100) : 100;

      const unackedDocs = targetedDocs.filter(
        (doc) => !ackSet.has(`${emp.id}:${doc.id}:${doc.document_version}`)
      );

      return {
        id: emp.id,
        name: emp.full_name || emp.email || "Unknown",
        dept: getDeptForUser(emp.id),
        total,
        acknowledged,
        pending,
        rate,
        unackedDocs,
      };
    }).filter((u) => u.total > 0) // only show users who have at least 1 targeted doc
      .sort((a, b) => a.rate - b.rate || b.pending - a.pending); // lowest compliance first
  }, [employees, policyDocs, allAcks, getEligibleEmployees, getDeptForUser]);

  if (userCompliance.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-muted-foreground gap-2">
          <UserCheck className="h-10 w-10" />
          <p className="text-sm">No compliance data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Unacknowledged</TableHead>
            <TableHead>Compliance</TableHead>
            <TableHead className="w-[100px]">Progress</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {userCompliance.map((user) => (
            <>
              <TableRow
                key={user.id}
                className={`cursor-pointer hover:bg-muted/50 ${user.pending > 0 ? "" : "opacity-70"}`}
                onClick={() => setExpandedUser(expandedUser === user.id ? null : user.id)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5">
                    {expandedUser === user.id ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    {user.name}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{user.dept}</TableCell>
                <TableCell>
                  {user.pending > 0 ? (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs border">
                      {user.pending} pending
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs border">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Complete
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {user.acknowledged} / {user.total}
                  <span className="ml-1.5 text-muted-foreground">({user.rate}%)</span>
                </TableCell>
                <TableCell>
                  <Progress value={user.rate} className="h-2" />
                </TableCell>
              </TableRow>
              {expandedUser === user.id && user.unackedDocs.length > 0 && (
                <TableRow key={`${user.id}-detail`}>
                  <TableCell colSpan={5} className="bg-muted/30 py-2 px-8">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Unacknowledged Policies:</p>
                    <ul className="space-y-1">
                      {user.unackedDocs.map((doc) => (
                        <li key={doc.id} className="text-sm flex items-center gap-2">
                          <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                          {doc.title}
                          <Badge variant="outline" className="text-[10px]">v{doc.document_version}</Badge>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main component ───

export default function PolicyAckReporting() {
  const [selectedDoc, setSelectedDoc] = useState<PolicyDoc | null>(null);
  const [docTrackingOpen, setDocTrackingOpen] = useState(true);
  const [complianceOpen, setComplianceOpen] = useState(true);

  const {
    policyDocs, loadingDocs, employees, allAcks,
    departments, getDeptForUser, getEligibleEmployees,
  } = usePolicyData();

  const docSummaries = useMemo(() =>
    policyDocs.map((doc) => {
      const eligible = getEligibleEmployees(doc);
      const acked = allAcks.filter(
        (a) => a.document_id === doc.id && a.document_version === doc.document_version
      );
      const total = eligible.length;
      const acknowledged = acked.filter((a) => eligible.some((e) => e.id === a.user_id)).length;
      const pending = total - acknowledged;
      const rate = total > 0 ? Math.round((acknowledged / total) * 100) : 0;
      return { ...doc, total, acknowledged, pending, rate };
    }),
    [policyDocs, allAcks, getEligibleEmployees]
  );

  // Drilldown view
  if (selectedDoc) {
    return (
      <DocDrillDown
        selectedDoc={selectedDoc}
        onBack={() => setSelectedDoc(null)}
        allAcks={allAcks}
        getEligibleEmployees={getEligibleEmployees}
        getDeptForUser={getDeptForUser}
        departments={departments}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Policy Acknowledgment Tracking (per-document) */}
      <Collapsible open={docTrackingOpen} onOpenChange={setDocTrackingOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full text-left group">
            {docTrackingOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <Users className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Policy Acknowledgment Tracking</h3>
            <Badge variant="secondary" className="text-xs ml-1">{policyDocs.length}</Badge>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          {loadingDocs ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : policyDocs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-muted-foreground gap-2">
                <FileText className="h-10 w-10" />
                <p className="text-sm">No documents require acknowledgment yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {docSummaries.map((doc) => (
                <Card
                  key={doc.id}
                  className="cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium truncate">{doc.title}</p>
                          <Badge variant="outline" className="text-[10px] shrink-0">v{doc.document_version}</Badge>
                          {doc.visibility_type === "department_specific" && (
                            <Badge variant="outline" className="text-[10px] shrink-0">Dept-specific</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Last updated {format(new Date(doc.updated_at), "PP")}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-center">
                          <p className="text-sm font-semibold text-emerald-600">{doc.acknowledged}</p>
                          <p className="text-[10px] text-muted-foreground">Acknowledged</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-amber-600">{doc.pending}</p>
                          <p className="text-[10px] text-muted-foreground">Pending</p>
                        </div>
                        <div className="w-16">
                          <Progress value={doc.rate} className="h-2" />
                          <p className="text-[10px] text-muted-foreground text-center mt-0.5">{doc.rate}%</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Section 2: Compliance Per User */}
      <Collapsible open={complianceOpen} onOpenChange={setComplianceOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center gap-2 w-full text-left group">
            {complianceOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <UserCheck className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Compliance Per User</h3>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-4">
          {loadingDocs ? (
            <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : (
            <CompliancePerUser
              policyDocs={policyDocs}
              employees={employees}
              allAcks={allAcks}
              getEligibleEmployees={getEligibleEmployees}
              getDeptForUser={getDeptForUser}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
