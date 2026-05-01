import { useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBadge } from "@/components/StatusBadge";
import { PriorityBadge } from "@/components/PriorityBadge";
import { SLACountdown } from "@/components/SLACountdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { Star, XCircle, BellDot, Crown, Users, Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useTicketSearch } from "@/hooks/useTicketSearch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useTicketUnreadCounts } from "@/hooks/useTicketUnreadCounts";

type Status = Database["public"]["Enums"]["status_enum"];

const TICKET_SELECT = "*, departments(name, code), owner:profiles!tickets_primary_assignee_id_fkey(full_name, profile_photo_url), requester:profiles!tickets_requester_id_fkey(full_name, profile_photo_url), ticket_survey(rating)";

const TableSkeleton = ({ cols, rows = 5 }: { cols: number; rows?: number }) => (
  <div className="rounded-lg border bg-card overflow-auto">
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <TableCell key={c}><Skeleton className="h-4 w-full" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const priorityOrder: Record<string, number> = { critical: 0, normal: 1, low: 2 };
const sortByPriority = (arr: any[]) =>
  [...arr].sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));

const splitTickets = (tickets: any[] | undefined) => {
  if (!tickets) return { active: [], forReview: [], closed: [] };
  const active = sortByPriority(tickets.filter((t) => t.status !== "closed" && t.status !== "for_review"));
  const forReview = sortByPriority(tickets.filter((t) => t.status === "for_review"));
  const closed = sortByPriority(tickets.filter((t) => t.status === "closed"));
  return { active, forReview, closed };
};

function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn("h-3.5 w-3.5", i <= rating ? "fill-warning text-warning" : "text-muted-foreground/30")} />
        ))}
      </div>
      <span className="text-xs font-medium text-muted-foreground">{rating}/5</span>
    </div>
  );
}

function OwnerCell({ owner, isCurrentUser }: { owner: any; isCurrentUser: boolean }) {
  const name = owner?.full_name || "Unassigned";
  const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("flex items-center gap-1.5", isCurrentUser && "font-semibold text-primary")}>
            <Avatar className="h-5 w-5">
              <AvatarImage src={owner?.profile_photo_url || undefined} />
              <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
            </Avatar>
            <Crown className="h-3.5 w-3.5 text-warning shrink-0" />
            <span className="truncate max-w-[120px]">{name}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>Ticket Owner – Responsible for resolving this ticket</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function MyTickets() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [cancelTicket, setCancelTicket] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const { byTicket, ownedTotal, submittedTotal, collaboratingTotal } = useTicketUnreadCounts();
  const { searchTerm, setSearchTerm, isSearching, isActive: searchActive, filterTickets, getMatchContext, getMatchSnippet, getRank, resultCount } = useTicketSearch(user?.id);

  // ---- My Action Items: tickets where user is the primary owner ----
  const { data: ownedTickets, isLoading: loadingOwned } = useQuery({
    queryKey: ["my-owned-tickets", user?.id, statusFilter],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .eq("primary_assignee_id", user!.id)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as Status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // ---- My Requests: tickets created by the user ----
  const { data: submittedTickets, isLoading: loadingSubmitted } = useQuery({
    queryKey: ["my-submitted-tickets", user?.id, statusFilter],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .eq("requester_id", user!.id)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as Status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // ---- Collaborating: tickets where user is a collaborator (not owner) ----
  const { data: collabTicketIds } = useQuery({
    queryKey: ["my-collab-ticket-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_collaborators")
        .select("ticket_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return data?.map((r) => r.ticket_id) || [];
    },
  });

  const { data: collabTickets, isLoading: loadingCollab } = useQuery({
    queryKey: ["my-collab-tickets", user?.id, statusFilter, collabTicketIds],
    enabled: !!user && !!collabTicketIds && collabTicketIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("tickets")
        .select(TICKET_SELECT)
        .in("id", collabTicketIds!)
        .neq("primary_assignee_id", user!.id)
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as Status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const handleCancelTicket = async () => {
    if (!cancelTicket || !cancelReason.trim() || !user) return;
    setCancelling(true);
    try {
      const { error } = await supabase.from("tickets").update({
        status: "closed" as Status,
        closed_at: new Date().toISOString(),
        closed_by: user.id,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason.trim(),
      }).eq("id", cancelTicket.id);
      if (error) throw error;

      await supabase.from("ticket_activity").insert({
        ticket_id: cancelTicket.id,
        actor_id: user.id,
        action: "cancelled",
        to_value: { reason: cancelReason.trim() },
      });

      await supabase.from("ticket_comments").insert({
        ticket_id: cancelTicket.id,
        author_id: user.id,
        body: `[Cancelled] ${cancelReason.trim()}`,
      });

      toast.success("Ticket cancelled");
      setCancelTicket(null);
      setCancelReason("");
      queryClient.invalidateQueries({ queryKey: ["my-submitted-tickets"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel ticket");
    } finally {
      setCancelling(false);
    }
  };

  // Counts for tab badges (non-closed tickets only)
  const ownedCount = filterTickets(ownedTickets)?.filter((t) => t.status !== "closed").length ?? 0;
  const submittedCount = filterTickets(submittedTickets)?.filter((t) => t.status !== "closed").length ?? 0;
  const collabCount = filterTickets(collabTickets)?.filter((t) => t.status !== "closed").length ?? 0;

  // ---- Unified search results (merged + deduplicated + relevance-sorted) ----
  const unifiedSearchResults = (() => {
    if (!searchActive) return [];
    const seen = new Set<string>();
    const results: (any & { _source: string[] })[] = [];

    const addTickets = (tickets: any[] | undefined, label: string) => {
      (tickets || []).forEach((t) => {
        if (seen.has(t.id)) {
          const existing = results.find((r) => r.id === t.id);
          if (existing && !existing._source.includes(label)) existing._source.push(label);
        } else {
          seen.add(t.id);
          results.push({ ...t, _source: [label] });
        }
      });
    };

    addTickets(filterTickets(ownedTickets || []), "My Action Item");
    addTickets(filterTickets(submittedTickets || []), "My Request");
    addTickets(filterTickets(collabTickets || []), "Collaborating");

    // Global sort by search relevance rank
    results.sort((a, b) => getRank(a.id) - getRank(b.id));

    return results;
  })();

  const isSearchLoading = searchActive && (isSearching || loadingOwned || loadingSubmitted || loadingCollab);

  const TicketTable = ({ tickets, showField, dimRows, showCancel, highlightOwner }: {
    tickets: any[] | undefined;
    showField: "owner" | "requester";
    dimRows?: boolean;
    showCancel?: boolean;
    highlightOwner?: boolean;
  }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Ticket</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>{showField === "owner" ? "Owner" : "Requester"}</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>SLA / Rating</TableHead>
          <TableHead>Created</TableHead>
          {showCancel && <TableHead className="w-16">Cancel</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {!tickets?.length ? (
          <TableRow><TableCell colSpan={showCancel ? 10 : 9} className="text-center text-muted-foreground py-8">
            {searchActive ? "No matching tickets in this tab" : "No tickets found"}
          </TableCell></TableRow>
        ) : tickets.map((t) => {
          const isClosed = t.status === "closed";
          const isCancelled = !!t.cancelled_at;
          const unreadCount = byTicket[t.id] || 0;
          const isOwner = highlightOwner && t.primary_assignee_id === user?.id;
          return (
            <TableRow key={t.id} className={cn(
              "cursor-pointer hover:bg-accent/50",
              (dimRows || isCancelled) && "opacity-50",
              isOwner && !dimRows && !isCancelled && "bg-primary/5"
            )}>
              <TableCell className="w-8 px-2">
                {unreadCount > 0 && (
                  <div className="relative flex items-center justify-center">
                    <BellDot className="h-4 w-4 text-destructive animate-pulse" />
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {unreadCount}
                    </span>
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Link to={`/tickets/${t.id}`} className="font-mono text-xs text-primary hover:underline">{t.ticket_no}</Link>
              </TableCell>
              <TableCell className="max-w-[250px]">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <Link to={`/tickets/${t.id}`} className="hover:underline truncate">{t.title}</Link>
                    {isCancelled && <span className="text-xs text-destructive font-medium shrink-0">Cancelled</span>}
                    {searchActive && getMatchContext(t.id) && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                        {getMatchContext(t.id)}
                      </span>
                    )}
                  </div>
                  {searchActive && getMatchSnippet(t.id) && (
                    <span className="text-[11px] text-muted-foreground truncate max-w-[230px] italic">
                      "…{getMatchSnippet(t.id)}…"
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm">{t.departments?.name}</TableCell>
              <TableCell className="text-sm">
                {showField === "owner"
                  ? <OwnerCell owner={t.owner} isCurrentUser={t.primary_assignee_id === user?.id} />
                  : (t.requester?.full_name || "—")}
              </TableCell>
              <TableCell><PriorityBadge priority={t.priority} /></TableCell>
              <TableCell><StatusBadge status={t.status} /></TableCell>
              <TableCell>
                {isClosed
                  ? <RatingStars rating={Array.isArray(t.ticket_survey) ? t.ticket_survey?.[0]?.rating : t.ticket_survey?.rating ?? null} />
                  : <SLACountdown slaDueAt={t.sla_due_at} slaBreachedAt={t.sla_breached_at} closedAt={t.closed_at} finalOverdueSeconds={t.final_overdue_seconds} status={t.status} />
                }
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</TableCell>
              {showCancel && (
                <TableCell>
                  {!isClosed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive/80"
                      onClick={(e) => { e.preventDefault(); setCancelTicket(t); }}
                      title="Cancel ticket"
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  const TicketSection = ({ tickets, showField, showCancel, highlightOwner }: {
    tickets: any[] | undefined;
    showField: "owner" | "requester";
    showCancel?: boolean;
    highlightOwner?: boolean;
  }) => {
    const { active, forReview, closed } = splitTickets(tickets);
    const showActive = statusFilter !== "closed" && statusFilter !== "for_review";
    const showForReview = statusFilter === "all" || statusFilter === "for_review";
    const showClosed = statusFilter === "all" || statusFilter === "closed";
    return (
      <div className="space-y-6">
        {showActive && (
          <div className="rounded-lg border bg-card overflow-auto">
            <TicketTable tickets={active.length ? active : (statusFilter !== "all" ? undefined : [])} showField={showField} showCancel={showCancel} highlightOwner={highlightOwner} />
          </div>
        )}
        {showForReview && forReview.length > 0 && (
          <div>
            {statusFilter !== "for_review" && (
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Pending Verification ({forReview.length})</h3>
            )}
            <div className="rounded-lg border border-warning/30 bg-card overflow-auto">
              <TicketTable tickets={forReview} showField={showField} showCancel={showCancel} highlightOwner={highlightOwner} />
            </div>
          </div>
        )}
        {showClosed && closed.length > 0 && (
          <div>
            {statusFilter !== "closed" && (
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Closed Tickets ({closed.length})</h3>
            )}
            <div className="rounded-lg border bg-card overflow-auto">
              <TicketTable tickets={closed} showField={showField} dimRows highlightOwner={highlightOwner} />
            </div>
          </div>
        )}
      </div>
    );
  };

  const defaultTab = searchParams.get("tab") === "submitted"
    ? "submitted"
    : searchParams.get("tab") === "collaborating"
    ? "collaborating"
    : "owned";

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold">My Tickets</h1>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by ID, title, description, comments..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="for_review">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* --- SEARCH ACTIVE: unified results --- */}
      {searchActive ? (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            {isSearchLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching...</span>
              </>
            ) : (
              <span className="font-medium text-foreground">
                Search Results
                {unifiedSearchResults.length > 0 && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    — {unifiedSearchResults.length} matching ticket{unifiedSearchResults.length === 1 ? "" : "s"} found
                  </span>
                )}
              </span>
            )}
          </div>

          {!isSearchLoading && (
            <div className="rounded-lg border bg-card overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Ticket</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>SLA / Rating</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unifiedSearchResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No tickets matched your search.
                      </TableCell>
                    </TableRow>
                  ) : unifiedSearchResults.map((t) => {
                    const isClosed = t.status === "closed";
                    const isCancelled = !!t.cancelled_at;
                    const unreadCount = byTicket[t.id] || 0;
                    return (
                      <TableRow key={t.id} className={cn(
                        "cursor-pointer hover:bg-accent/50",
                        isCancelled && "opacity-50",
                      )}>
                        <TableCell className="w-8 px-2">
                          {unreadCount > 0 && (
                            <div className="relative flex items-center justify-center">
                              <BellDot className="h-4 w-4 text-destructive animate-pulse" />
                              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                                {unreadCount}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link to={`/tickets/${t.id}`} className="font-mono text-xs text-primary hover:underline">{t.ticket_no}</Link>
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Link to={`/tickets/${t.id}`} className="hover:underline truncate">{t.title}</Link>
                              {isCancelled && <span className="text-xs text-destructive font-medium shrink-0">Cancelled</span>}
                              {getMatchContext(t.id) && (
                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground font-medium">
                                  {getMatchContext(t.id)}
                                </span>
                              )}
                            </div>
                            {getMatchSnippet(t.id) && (
                              <span className="text-[11px] text-muted-foreground truncate max-w-[230px] italic">
                                "…{getMatchSnippet(t.id)}…"
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(t._source as string[]).map((s: string) => (
                              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium whitespace-nowrap">
                                {s}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{t.departments?.name}</TableCell>
                        <TableCell className="text-sm">
                          <OwnerCell owner={t.owner} isCurrentUser={t.primary_assignee_id === user?.id} />
                        </TableCell>
                        <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                        <TableCell><StatusBadge status={t.status} /></TableCell>
                        <TableCell>
                          {isClosed
                            ? <RatingStars rating={Array.isArray(t.ticket_survey) ? t.ticket_survey?.[0]?.rating : t.ticket_survey?.rating ?? null} />
                            : <SLACountdown slaDueAt={t.sla_due_at} slaBreachedAt={t.sla_breached_at} closedAt={t.closed_at} finalOverdueSeconds={t.final_overdue_seconds} status={t.status} />
                          }
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      ) : (
        /* --- NORMAL: tabbed layout --- */
        <Tabs
          defaultValue={defaultTab}
          onValueChange={(v) => setSearchParams(v === "owned" ? {} : { tab: v }, { replace: true })}
        >
          <TabsList>
            <TabsTrigger value="owned" className="relative gap-1.5">
              <Crown className="h-3.5 w-3.5" />
              My Action Items
              {ownedCount > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({ownedCount})</span>
              )}
              {ownedTotal > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {ownedTotal}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="submitted" className="relative">
              My Requests
              {submittedCount > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({submittedCount})</span>
              )}
              {submittedTotal > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {submittedTotal}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="collaborating" className="relative gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Collaborating
              {collabCount > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">({collabCount})</span>
              )}
              {collaboratingTotal > 0 && (
                <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                  {collaboratingTotal}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="owned" className="mt-4">
            {loadingOwned ? <TableSkeleton cols={9} /> : (
              <TicketSection tickets={filterTickets(ownedTickets || [])} showField="requester" />
            )}
          </TabsContent>

          <TabsContent value="submitted" className="mt-4">
            {loadingSubmitted ? <TableSkeleton cols={10} /> : (
              <TicketSection tickets={filterTickets(submittedTickets)} showField="owner" showCancel highlightOwner />
            )}
          </TabsContent>

          <TabsContent value="collaborating" className="mt-4">
            {loadingCollab ? <TableSkeleton cols={9} /> : (
              <TicketSection tickets={filterTickets(collabTickets || [])} showField="owner" highlightOwner />
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Cancel Ticket Dialog */}
      <Dialog open={!!cancelTicket} onOpenChange={(open) => { if (!open) { setCancelTicket(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Ticket {cancelTicket?.ticket_no}</DialogTitle>
            <DialogDescription>This will close the ticket as cancelled. Please provide a reason.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Why are you cancelling this ticket?"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelTicket(null); setCancelReason(""); }}>
              Keep Ticket
            </Button>
            <Button variant="destructive" disabled={!cancelReason.trim() || cancelling} onClick={handleCancelTicket}>
              {cancelling ? "Cancelling..." : "Cancel Ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
