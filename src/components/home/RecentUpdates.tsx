import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, Bell, ArrowRight } from "lucide-react";
import { parseISO } from "date-fns";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function RecentUpdates() {
  const { user } = useAuth();
  const [open, setOpen] = useState(true);

  const { data: items = [] } = useQuery({
    queryKey: ["home-recent-updates", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, created_at, link, is_read")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border bg-card p-6">
        <CollapsibleTrigger className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Updates
            </h2>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-4">No recent updates.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.link || "/"}
                    className="group flex items-start justify-between gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className={`text-sm leading-snug truncate ${!n.is_read ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                        {n.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                      {timeAgo(parseISO(n.created_at!))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            to="/tickets"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-4 hover:underline"
          >
            View All Activity <ArrowRight className="h-3 w-3" />
          </Link>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
