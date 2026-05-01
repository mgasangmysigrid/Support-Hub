import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";

type AuditEntry = {
  id: string;
  endorsement_id: string;
  endorsement_item_id: string | null;
  actor_id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor?: { full_name: string | null; email: string | null };
};

export default function EndorsementAuditTrail({
  endorsementId,
}: {
  endorsementId: string;
}) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ["endorsement-audit", endorsementId],
    enabled: !!endorsementId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("endorsement_audit_log")
        .select("*, actor:profiles!endorsement_audit_log_actor_id_fkey(full_name, email)")
        .eq("endorsement_id", endorsementId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AuditEntry[];
    },
  });

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        Loading audit trail...
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-4">
        No audit trail entries yet.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="space-y-1">
        {entries.map((entry) => (
          <AuditEntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </ScrollArea>
  );
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const actorName = entry.actor?.full_name || entry.actor?.email || "Unknown";
  const hasDetails = entry.old_value || entry.new_value;

  const description = formatAction(entry, actorName);

  return (
    <div className="border-l-2 border-muted pl-3 py-1.5">
      <div className="flex items-start gap-2">
        <History className="h-3 w-3 mt-1 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs leading-relaxed">{description}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {format(new Date(entry.created_at), "MMM d, yyyy h:mm a")}
          </p>
          {hasDetails && (
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[10px] text-muted-foreground"
                >
                  {expanded ? (
                    <ChevronDown className="h-3 w-3 mr-0.5" />
                  ) : (
                    <ChevronRight className="h-3 w-3 mr-0.5" />
                  )}
                  Details
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-1 p-2 bg-muted/50 rounded text-[10px] space-y-1">
                  {entry.old_value && (
                    <div>
                      <span className="text-muted-foreground">Previous: </span>
                      <span className="break-words">{truncateValue(entry.old_value)}</span>
                    </div>
                  )}
                  {entry.new_value && (
                    <div>
                      <span className="text-muted-foreground">New: </span>
                      <span className="break-words">{truncateValue(entry.new_value)}</span>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </div>
  );
}

function formatAction(entry: AuditEntry, actorName: string): string {
  const { action, field_name } = entry;

  switch (action) {
    case "created":
      return `${actorName} created this endorsement`;
    case "draft_saved":
      return `${actorName} saved draft`;
    case "submitted":
      return `${actorName} submitted the endorsement`;
    case "acknowledged":
      return `${actorName} acknowledged the endorsement`;
    case "deleted":
      return `${actorName} deleted the endorsement`;
    case "item_added":
      return `${actorName} added an endorsement item`;
    case "item_removed":
      return `${actorName} removed an endorsement item`;
    case "field_changed":
      if (field_name) {
        const label = fieldLabel(field_name);
        return `${actorName} updated ${label}`;
      }
      return `${actorName} made a change`;
    default:
      return `${actorName} — ${action}`;
  }
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    endorsement_notes: "Endorsement Notes",
    urgency: "Urgency",
    endorsed_to: "Endorse To",
    recipients: "Recipients",
    urgency_level: "Urgency Level",
    risk_notes: "Open Concerns",
    pending_issues: "Pending Issues",
    time_sensitive_deadlines: "Time-Sensitive Deadlines",
    important_warnings: "Important Warnings",
    status: "Status",
  };
  return labels[field] || field.replace(/_/g, " ");
}

function truncateValue(val: string, max = 200): string {
  if (val.length <= max) return val;
  return val.slice(0, max) + "…";
}
