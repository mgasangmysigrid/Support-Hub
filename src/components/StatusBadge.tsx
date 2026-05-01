import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["status_enum"];

const statusConfig: Record<Status, { label: string; className: string }> = {
  open: { label: "Open", className: "badge-open" },
  in_progress: { label: "In Progress", className: "badge-in-progress" },
  blocked: { label: "Blocked", className: "badge-blocked" },
  for_review: { label: "Resolved", className: "badge-for-review" },
  closed: { label: "Closed", className: "badge-closed" },
};

export function StatusBadge({ status }: { status: Status }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", config.className)}>
      {config.label}
    </span>
  );
}
