import { useEffect, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, Download } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import BulletinReactions from "./BulletinReactions";
import BulletinComments from "./BulletinComments";
import { renderMentionText } from "@/lib/mention-utils";
import type { BulletinMentionNotification } from "@/hooks/useHomeUnreads";

interface Attachment {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  sort_order: number;
}

interface Post {
  id: string;
  title: string;
  audience_label: string | null;
  content_body: string;
  author_user_id: string;
  external_link: string | null;
  external_link_label: string | null;
  status: string;
  is_pinned: boolean;
  created_at: string;
  profiles: { full_name: string | null; profile_photo_url: string | null } | null;
  bulletin_attachments: Attachment[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: Post;
  highlightCommentId?: string | null;
  mentionNotifications?: BulletinMentionNotification[];
}

export default function BulletinDetailDialog({ open, onOpenChange, post, highlightCommentId, mentionNotifications }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const images = post.bulletin_attachments?.filter((a) => a.file_type === "image") ?? [];
  const pdfs = post.bulletin_attachments?.filter((a) => a.file_type === "pdf") ?? [];
  const authorName = post.profiles?.full_name ?? "Unknown";
  const initials = authorName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Determine if this is a post-level mention (highlight body)
  const isPostMention = mentionNotifications?.some((m) => m.source === "post");

  // Mark mention notifications as read when dialog opens (user has reached the target)
  const markMentionNotificationsRead = useCallback(async () => {
    if (!mentionNotifications?.length || !user) return;
    const ids = mentionNotifications.map((m) => m.id);
    console.log(`[bulletin-detail] Marking ${ids.length} mention notifications as read for post ${post.id}`);
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", ids);
    if (!error) {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["home-unreads-bulletin-mentions", user.id] });
      qc.invalidateQueries({ queryKey: ["sidebar-badge-home"] });
    }
  }, [mentionNotifications, user, post.id, qc]);

  useEffect(() => {
    if (open) {
      // Small delay to ensure user has visually reached the content
      const timer = setTimeout(markMentionNotificationsRead, 1500);
      return () => clearTimeout(timer);
    }
  }, [open, markMentionNotificationsRead]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug">{post.title}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex items-center gap-3 pt-1">
              <Avatar className="h-6 w-6">
                <AvatarImage src={post.profiles?.profile_photo_url ?? undefined} />
                <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">
                {authorName} · {format(new Date(post.created_at), "MMM d, yyyy")}
              </span>
              {post.audience_label && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  {post.audience_label}
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Body with mention rendering — highlight if post-level mention */}
        <div
          className={`prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed rounded-md transition-colors ${
            isPostMention ? "bg-primary/5 ring-1 ring-primary/20 p-3 -mx-1" : ""
          }`}
        >
          {renderMentionText(post.content_body, navigate)}
        </div>

        {/* Images */}
        {images.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {images.map((img) => (
              <a key={img.id} href={img.file_url} target="_blank" rel="noopener noreferrer">
                <img
                  src={img.file_url}
                  alt={img.file_name}
                  className="rounded-lg w-full h-auto object-cover max-h-64 border border-border"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}

        {/* PDFs */}
        {pdfs.length > 0 && (
          <div className="space-y-2">
            {pdfs.map((pdf) => (
              <a
                key={pdf.id}
                href={pdf.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border p-3 hover:bg-accent/50 transition-colors"
              >
                <FileText className="h-5 w-5 text-destructive/70 shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{pdf.file_name}</span>
                <Download className="h-4 w-4 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        )}

        {/* External link */}
        {post.external_link && (
          <Button variant="outline" size="sm" asChild>
            <a href={post.external_link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              {post.external_link_label || "Open Link"}
            </a>
          </Button>
        )}

        {/* Reactions */}
        <Separator />
        <BulletinReactions postId={post.id} />

        {/* Comments */}
        <Separator />
        <BulletinComments postId={post.id} postTitle={post.title} highlightCommentId={highlightCommentId} />
      </DialogContent>
    </Dialog>
  );
}
