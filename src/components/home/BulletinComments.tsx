import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackActivity, ANALYTICS_EVENTS } from "@/hooks/use-activity-tracker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Send, X, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import MentionInput from "./MentionInput";
import { renderMentionText, extractMentionIds, hasEveryoneMention } from "@/lib/mention-utils";
import { createBulletinMentionNotifications } from "@/lib/bulletin-notification-utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

const AUTHORIZED_IDS = [
  "ebcc22a7-86ca-423e-ba47-6c06452c0249",
  "32e61f10-5d29-40a2-adea-1d2894fea6d4",
];

interface Props {
  postId: string;
  postTitle?: string;
  highlightCommentId?: string | null;
}

export default function BulletinComments({ postId, postTitle, highlightCommentId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [newComment, setNewComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const isAdmin = user ? AUTHORIZED_IDS.includes(user.id) : false;

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["bulletin-comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_comments")
        .select("*, profiles!bulletin_comments_user_id_fkey(full_name, profile_photo_url)")
        .eq("bulletin_post_id", postId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Auto-scroll to highlighted comment when comments load
  useEffect(() => {
    if (!highlightCommentId || isLoading || comments.length === 0) return;
    const hasComment = comments.some((c: any) => c.id === highlightCommentId);
    if (!hasComment) return;

    setHighlightedId(highlightCommentId);

    const timer = setTimeout(() => {
      const el = document.getElementById(`comment-${highlightCommentId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        console.log(`[bulletin-comments] Scrolled to comment ${highlightCommentId}`);
      }
    }, 300);

    // Remove highlight after 4s
    const fadeTimer = setTimeout(() => setHighlightedId(null), 4000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fadeTimer);
    };
  }, [highlightCommentId, comments, isLoading]);

  const handleLimitError = (err: any) => {
    const msg = err?.message || "";
    if (msg.includes("EVERYONE_LIMIT_EXCEEDED")) {
      toast.error("You have reached the daily limit for @everyone (3 per day).");
    } else {
      toast.error(msg || "Failed");
    }
  };

  /** Sync mention records for a comment, handling add/remove */
  const syncMentions = async (commentId: string, body: string) => {
    const mentionIds = extractMentionIds(body);

    // Delete all existing mentions for this comment first
    await supabase
      .from("bulletin_comment_mentions")
      .delete()
      .eq("comment_id", commentId);

    // Insert new ones (unique constraint prevents dupes if race)
    if (mentionIds.length > 0) {
      await supabase.from("bulletin_comment_mentions").insert(
        mentionIds.map((uid) => ({ comment_id: commentId, mentioned_user_id: uid }))
      );
    }
  };

  const addComment = useMutation({
    mutationFn: async (body: string) => {
      if (!user) return;
      const trimmed = body.trim();
      const everyoneMentioned = hasEveryoneMention(trimmed);
      const { data, error } = await supabase
        .from("bulletin_comments")
        .insert({ bulletin_post_id: postId, user_id: user.id, body: trimmed, mentions_everyone: everyoneMentioned })
        .select("id")
        .single();
      if (error) throw error;
      if (user) trackActivity(user.id, ANALYTICS_EVENTS.COMMENTED_UPDATE.module, ANALYTICS_EVENTS.COMMENTED_UPDATE.event, "bulletin_comment", data?.id);
      if (data) {
        await syncMentions(data.id, trimmed);
        // Create mention notifications for comment — include commentId for deep linking
        const mentionIds = extractMentionIds(trimmed);
        if (mentionIds.length > 0 || everyoneMentioned) {
          await createBulletinMentionNotifications({
            postId,
            postTitle: postTitle || "a bulletin post",
            actorId: user.id,
            mentionedUserIds: mentionIds,
            isEveryone: everyoneMentioned,
            type: "bulletin_comment_mention",
            commentId: data.id,
          });
        }
      }
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: ["bulletin-comments", postId] });
    },
    onError: (err: any) => handleLimitError(err),
  });

  const updateComment = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const trimmed = body.trim();
      const everyoneMentioned = hasEveryoneMention(trimmed);
      const { error } = await supabase
        .from("bulletin_comments")
        .update({ body: trimmed, updated_at: new Date().toISOString(), mentions_everyone: everyoneMentioned })
        .eq("id", id);
      if (error) throw error;
      await syncMentions(id, trimmed);
    },
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["bulletin-comments", postId] });
    },
    onError: (err: any) => handleLimitError(err),
  });

  const deleteComment = useMutation({
    mutationFn: async (id: string) => {
      // Mentions cascade-delete automatically via FK
      const { error } = await supabase.from("bulletin_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulletin-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["bulletin-comment-count", postId] });
      toast.success("Comment deleted");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete"),
  });

  const confirmAndSubmit = useCallback((action: () => void, text: string) => {
    if (hasEveryoneMention(text)) {
      setPendingAction(() => action);
    } else {
      action();
    }
  }, []);

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    confirmAndSubmit(() => addComment.mutate(newComment), newComment);
  };

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-2">No comments yet. Be the first!</p>
      ) : (
        <div ref={scrollContainerRef} className="space-y-2 max-h-60 overflow-y-auto">
          {comments.map((c: any) => {
            const name = c.profiles?.full_name ?? "Unknown";
            const initials = name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
            const canModify = c.user_id === user?.id;
            const isEditing = editingId === c.id;
            const isHighlighted = highlightedId === c.id;

            return (
              <div
                key={c.id}
                id={`comment-${c.id}`}
                className={`flex gap-2 group rounded-md transition-all duration-700 ${
                  isHighlighted
                    ? "bg-primary/10 ring-1 ring-primary/30 p-1.5 -mx-1.5"
                    : ""
                }`}
              >
                <Avatar className="h-6 w-6 mt-0.5 shrink-0">
                  <AvatarImage src={c.profiles?.profile_photo_url ?? undefined} />
                  <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-xs font-semibold text-foreground cursor-pointer hover:underline"
                      onClick={() => navigate(`/profile/${c.user_id}`)}
                    >
                      {name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                    {c.updated_at !== c.created_at && (
                      <span className="text-[9px] text-muted-foreground">(edited)</span>
                    )}
                  </div>
                  {isEditing ? (
                    <div className="mt-1 space-y-1">
                      <MentionInput
                        value={editBody}
                        onChange={setEditBody}
                        placeholder="Edit comment…"
                        className="text-xs min-h-[32px]"
                        showEveryone
                        rows={2}
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => confirmAndSubmit(() => updateComment.mutate({ id: c.id, body: editBody }), editBody)}
                          disabled={!editBody.trim()}
                        >
                          <Check className="h-3 w-3 mr-0.5" /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-3 w-3 mr-0.5" /> Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
                      {renderMentionText(c.body, navigate)}
                    </p>
                  )}
                </div>
                {!isEditing && (canModify || isAdmin) && (
                  <div className="flex items-start gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canModify && (
                      <button
                        className="p-0.5 text-muted-foreground hover:text-foreground"
                        onClick={() => { setEditingId(c.id); setEditBody(c.body); }}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      className="p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteComment.mutate(c.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {user && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <MentionInput
              value={newComment}
              onChange={setNewComment}
              placeholder="Write a comment… Use @ to mention"
              className="text-xs min-h-[32px]"
              showEveryone
            />
          </div>
          <Button
            size="sm"
            className="h-8 px-2.5 shrink-0"
            onClick={handleSubmit}
            disabled={!newComment.trim() || addComment.isPending}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <AlertDialog open={!!pendingAction} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Notify all employees?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a notification to all employees. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { pendingAction?.(); setPendingAction(null); }}>
              Yes, notify everyone
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
