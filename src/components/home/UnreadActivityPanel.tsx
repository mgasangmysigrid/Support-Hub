import { Bell, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { UnreadBulletin } from "@/hooks/useHomeUnreads";

interface UnreadActivityPanelProps {
  unreadBulletins: UnreadBulletin[];
  unreadMentionCount: number;
  bulletinMentionCount?: number;
}

export default function UnreadActivityPanel({ unreadBulletins, unreadMentionCount, bulletinMentionCount = 0 }: UnreadActivityPanelProps) {
  const total = unreadBulletins.length + unreadMentionCount + bulletinMentionCount;
  const navigate = useNavigate();
  if (total === 0) return null;

  const parts: string[] = [];
  if (unreadBulletins.length > 0) {
    parts.push(`${unreadBulletins.length} update${unreadBulletins.length !== 1 ? "s" : ""}`);
  }
  if (bulletinMentionCount > 0) {
    parts.push(`${bulletinMentionCount} bulletin mention${bulletinMentionCount !== 1 ? "s" : ""}`);
  }
  if (unreadMentionCount > 0) {
    parts.push(`${unreadMentionCount} photo mention${unreadMentionCount !== 1 ? "s" : ""}`);
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/notifications")}
      className="w-full flex items-center gap-3 rounded-lg border border-border/60 bg-muted/40 px-4 py-2.5 text-left transition-all hover:bg-muted/70 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer group"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Bell className="h-3.5 w-3.5 text-primary" />
      </span>

      <span className="flex-1 min-w-0 text-sm">
        <span className="font-medium text-foreground/80">Unread</span>
        <span className="mx-1.5 text-muted-foreground/40">·</span>
        <span className="text-muted-foreground">{parts.join(", ")}</span>
      </span>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />
    </button>
  );
}
