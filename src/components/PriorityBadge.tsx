import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { AlertTriangle, ArrowDown, Minus } from "lucide-react";

type Priority = Database["public"]["Enums"]["priority_enum"];

export function PriorityBadge({ priority }: { priority: Priority }) {
  const config = {
    critical: { className: "badge-critical", icon: AlertTriangle, label: "Critical" },
    normal: { className: "badge-normal", icon: Minus, label: "Normal" },
    low: { className: "bg-muted text-muted-foreground", icon: ArrowDown, label: "Low" },
  };

  const { className, icon: Icon, label } = config[priority] || config.normal;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
