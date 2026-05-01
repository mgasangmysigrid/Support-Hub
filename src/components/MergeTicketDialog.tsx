import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Merge, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MergeTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentTicketId: string;
  departmentId: string;
  onMerged: () => void;
}

export function MergeTicketDialog({ open, onOpenChange, parentTicketId, departmentId, onMerged }: MergeTicketDialogProps) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const { data: candidates } = useQuery({
    queryKey: ["merge-candidates", departmentId, parentTicketId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, ticket_no, title, status, requester:profiles!tickets_requester_id_fkey(full_name)")
        .eq("department_id", departmentId)
        .is("merged_into_id", null)
        .neq("id", parentTicketId)
        .in("status", ["open", "in_progress", "blocked", "for_review"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filtered = candidates?.filter((t) => {
    const q = search.toLowerCase();
    return !q || t.ticket_no.toLowerCase().includes(q) || t.title.toLowerCase().includes(q);
  });

  const toggle = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleMerge = async () => {
    if (!user || selected.length === 0) return;
    setSubmitting(true);
    try {
      // Update child tickets: set merged_into_id and status to closed
      const { error: updateErr } = await supabase
        .from("tickets")
        .update({
          merged_into_id: parentTicketId,
          status: "closed" as any,
          closed_at: new Date().toISOString(),
          closed_by: user.id,
        })
        .in("id", selected);
      if (updateErr) throw updateErr;

      // Log activity on parent
      await supabase.from("ticket_activity").insert({
        ticket_id: parentTicketId,
        actor_id: user.id,
        action: "tickets_merged",
        to_value: { merged_ticket_ids: selected },
      });

      // Log activity on each child
      for (const childId of selected) {
        await supabase.from("ticket_activity").insert({
          ticket_id: childId,
          actor_id: user.id,
          action: "merged_into",
          to_value: { parent_ticket_id: parentTicketId },
        });
      }

      toast.success(`${selected.length} ticket(s) merged successfully`);
      setSelected([]);
      setSearch("");
      onOpenChange(false);
      onMerged();
    } catch (e: any) {
      toast.error(e.message || "Failed to merge tickets");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" /> Merge Tickets
          </DialogTitle>
          <DialogDescription>
            Select tickets to merge into this one. Their requesters will be able to see updates and comment on this ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ticket # or title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="max-h-64">
          <div className="space-y-2">
            {filtered?.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No eligible tickets found</p>
            )}
            {filtered?.map((t) => (
              <label
                key={t.id}
                className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  checked={selected.includes(t.id)}
                  onCheckedChange={() => toggle(t.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-muted-foreground">{t.ticket_no}</span>
                    <Badge variant="outline" className="text-xs">{t.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <p className="text-xs text-muted-foreground">By {(t.requester as any)?.full_name || "Unknown"}</p>
                </div>
              </label>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleMerge} disabled={submitting || selected.length === 0}>
            Merge {selected.length > 0 ? `${selected.length} ticket(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
