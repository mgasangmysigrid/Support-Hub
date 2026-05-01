import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useMyEndorsements,
  useAllEndorsements,
  useTeamEndorsements,
  type Endorsement,
} from "@/hooks/useEndorsements";
import EndorsementList from "@/components/endorsements/EndorsementList";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

function splitActive(endorsements: Endorsement[]) {
  const active: Endorsement[] = [];
  const cancelled: Endorsement[] = [];
  for (const e of endorsements) {
    if (e.status === "cancelled") cancelled.push(e);
    else active.push(e);
  }
  return { active, cancelled };
}

function useFilteredEndorsements(
  endorsements: Endorsement[],
  statusFilter: string,
  searchQuery: string
) {
  return useMemo(() => {
    let filtered = endorsements;
    if (statusFilter !== "all") {
      filtered = filtered.filter((e) => e.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (e) =>
          e.employee?.full_name?.toLowerCase().includes(q) ||
          e.employee?.email?.toLowerCase().includes(q) ||
          e.department?.name?.toLowerCase().includes(q) ||
          e.leave_type?.toLowerCase().includes(q) ||
          e.status.toLowerCase().includes(q) ||
          (e as any).control_number?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [endorsements, statusFilter, searchQuery]);
}

export default function EndorsementEntry() {
  const navigate = useNavigate();
  const { user, isSuperAdmin, isPcMember, isManager, managedDepartments } = useAuth();
  const { data: endorsements, isLoading } = useMyEndorsements();
  const isOwner = isSuperAdmin || isPcMember;

  const { data: allEndorsements, isLoading: allLoading } = useAllEndorsements(isOwner);
  const { data: teamEndorsements, isLoading: teamLoading } = useTeamEndorsements(
    isManager && !isOwner,
    managedDepartments
  );

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [recipientEndorsementIds, setRecipientEndorsementIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: recipientRows } = await supabase
        .from("leave_endorsement_recipients")
        .select("endorsement_id")
        .eq("recipient_user_id", user.id);
      setRecipientEndorsementIds(new Set((recipientRows || []).map((r) => r.endorsement_id)));
    })();
  }, [user, endorsements]);

  const myAll = (endorsements || []).filter((e) => e.employee_user_id === user?.id);
  const { active: myEndorsements, cancelled: myCancelled } = splitActive(myAll);

  const assignedAll = (endorsements || []).filter(
    (e) => e.employee_user_id !== user?.id && recipientEndorsementIds.has(e.id)
  );
  const { active: assignedToMe, cancelled: assignedCancelled } = splitActive(assignedAll);

  const { active: allActive, cancelled: allCancelledList } = splitActive(allEndorsements || []);
  const { active: teamActive, cancelled: teamCancelledList } = splitActive(teamEndorsements || []);

  const filteredAll = useFilteredEndorsements(allActive, statusFilter, searchQuery);
  const filteredTeam = useFilteredEndorsements(teamActive, statusFilter, searchQuery);

  const defaultTab = "my";

  const handleSelect = (id: string) => navigate(`/leave/endorsements/${id}`);

  const FilterBar = () => (
    <div className="flex flex-col sm:flex-row gap-2 mb-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by employee, department, status..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const CancelledSection = ({ items }: { items: Endorsement[] }) =>
    items.length > 0 ? (
      <div className="mt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Cancelled</h3>
        <div className="opacity-50">
          <EndorsementList
            endorsements={items}
            loading={false}
            emptyMessage=""
            onSelect={handleSelect}
            role="employee"
          />
        </div>
      </div>
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Endorsements</h1>
          <p className="text-sm text-muted-foreground">
            Prepare handover details before your leave begins
          </p>
        </div>
        <Button onClick={() => navigate("/leave/endorsements/new")}>
          <Plus className="h-4 w-4 mr-2" /> New Endorsement
        </Button>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="my">My Endorsements</TabsTrigger>
          <TabsTrigger value="assigned">Assigned to Me</TabsTrigger>
          {isManager && !isOwner && (
            <TabsTrigger value="team">Team Endorsements</TabsTrigger>
          )}
          {isOwner && (
            <TabsTrigger value="all">All Endorsements</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="my">
          <EndorsementList
            endorsements={myEndorsements}
            loading={isLoading}
            emptyMessage="No endorsements yet. Click 'New Endorsement' to create one."
            onSelect={handleSelect}
            role="employee"
          />
          <CancelledSection items={myCancelled} />
        </TabsContent>

        <TabsContent value="assigned">
          <EndorsementList
            endorsements={assignedToMe}
            loading={isLoading}
            emptyMessage="No endorsements assigned to you."
            onSelect={handleSelect}
            role="recipient"
          />
          <CancelledSection items={assignedCancelled} />
        </TabsContent>

        {isManager && !isOwner && (
          <TabsContent value="team">
            <FilterBar />
            <EndorsementList
              endorsements={filteredTeam}
              loading={teamLoading}
              emptyMessage="No endorsements from your team members."
              onSelect={handleSelect}
              role="recipient"
            />
            <CancelledSection items={teamCancelledList} />
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="all">
            <FilterBar />
            <EndorsementList
              endorsements={filteredAll}
              loading={allLoading}
              emptyMessage="No endorsements found."
              onSelect={handleSelect}
              role="recipient"
            />
            <CancelledSection items={allCancelledList} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
