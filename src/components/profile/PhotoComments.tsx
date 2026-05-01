import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow, subHours } from "date-fns";

const MAX_COMMENTS_PER_WINDOW = 3;
const WINDOW_HOURS = 8;

interface PhotoComment {
  id: string;
  photo_id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    email: string | null;
    profile_photo_url: string | null;
  } | null;
}

interface MentionUser {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface PhotoCommentsProps {
  photoId: string;
  defaultExpanded?: boolean;
}

export default function PhotoComments({ photoId, defaultExpanded = false }: PhotoCommentsProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Mark photo mention notifications as read when expanded
  useEffect(() => {
    if (!expanded || !user) return;
    const markRead = async () => {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("type", "photo_mention")
        .eq("link", photoId)
        .eq("is_read", false);
      qc.invalidateQueries({ queryKey: ["photo-mention-badges"] });
      qc.invalidateQueries({ queryKey: ["sidebar-badge-home"] });
    };
    markRead();
  }, [expanded, user, photoId, qc]);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(0);

  // Fetch comments
  const { data: comments = [] } = useQuery({
    queryKey: ["photo-comments", photoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photo_comments" as any)
        .select("*, profiles:user_id(id, full_name, email, profile_photo_url)")
        .eq("photo_id", photoId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as PhotoComment[];
    },
    enabled: expanded,
  });

  // Compute comment count (always fetched for the counter badge)
  const { data: commentCount = 0 } = useQuery({
    queryKey: ["photo-comment-count", photoId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("photo_comments" as any)
        .select("id", { count: "exact", head: true })
        .eq("photo_id", photoId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Anti-spam: count user's comments in the last 8 hours
  const recentUserComments = useMemo(() => {
    if (!user || !comments.length) return 0;
    const windowStart = subHours(new Date(), WINDOW_HOURS);
    return comments.filter(
      (c) => c.user_id === user.id && new Date(c.created_at) >= windowStart
    ).length;
  }, [comments, user]);

  const remainingComments = MAX_COMMENTS_PER_WINDOW - recentUserComments;
  const isLimitReached = remainingComments <= 0;

  // Fetch mention users
  const { data: mentionUsers = [] } = useQuery({
    queryKey: ["mention-users-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data as MentionUser[];
    },
    enabled: expanded,
  });

  const filteredUsers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    return mentionUsers
      .filter((u) => u.id !== user?.id)
      .filter((u) => {
        const name = u.full_name?.trim().toLowerCase() ?? "";
        const email = u.email?.trim().toLowerCase() ?? "";
        return name.includes(q) || email.includes(q);
      })
      .slice(0, 6);
  }, [mentionQuery, mentionUsers, user?.id]);

  const showDropdown = mentionQuery !== null && filteredUsers.length > 0;

  const insertMention = useCallback(
    (mu: MentionUser) => {
      const firstName = (mu.full_name || mu.email || "user").split(" ")[0];
      const before = body.slice(0, mentionStartPos - 1);
      const after = body.slice(textareaRef.current?.selectionStart ?? mentionStartPos);
      const newValue = `${before}@${firstName} ${after}`;
      setBody(newValue);
      setMentionQuery(null);
      setTimeout(() => {
        const pos = mentionStartPos - 1 + firstName.length + 2;
        textareaRef.current?.setSelectionRange(pos, pos);
        textareaRef.current?.focus();
      }, 0);
    },
    [body, mentionStartPos]
  );

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setBody(newValue);
    const cursorPos = e.target.selectionStart;
    const textBefore = newValue.slice(0, cursorPos);
    const atMatch = textBefore.match(/@([^\s@]*)$/);
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStartPos(cursorPos - atMatch[1].length);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showDropdown) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredUsers.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredUsers[mentionIndex]) insertMention(filteredUsers[mentionIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionQuery(null);
      }
    },
    [showDropdown, filteredUsers, mentionIndex, insertMention]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMentionQuery(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  // Post comment mutation
  const postMutation = useMutation({
    mutationFn: async () => {
      if (!user || !body.trim()) return;

      // Anti-spam check
      if (isLimitReached) {
        throw new Error("You've reached the comment limit for this photo. You can comment again in a few hours.");
      }

      // Extract mentioned names from body
      const mentions = body.match(/@(\S+)/g) || [];
      
      const { error } = await supabase.from("photo_comments" as any).insert({
        photo_id: photoId,
        user_id: user.id,
        body: body.trim(),
      });
      if (error) throw error;

      // Send notifications for mentions
      for (const mention of mentions) {
        const firstName = mention.slice(1); // remove @
        const mentioned = mentionUsers.find(
          (u) => (u.full_name || "").split(" ")[0].toLowerCase() === firstName.toLowerCase()
        );
        if (mentioned && mentioned.id !== user.id) {
          const authorName = (await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single()).data?.full_name || "Someone";

          await supabase.from("notifications").insert({
            user_id: mentioned.id,
            type: "photo_mention",
            title: "You were mentioned in a photo comment",
            body: `${authorName} mentioned you in a photo comment`,
            link: photoId,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-comments", photoId] });
      qc.invalidateQueries({ queryKey: ["photo-comment-count", photoId] });
      setBody("");
      setMentionQuery(null);
    },
    onError: (err: any) => toast.error(err.message || "Failed to post comment"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from("photo_comments" as any)
        .delete()
        .eq("id", commentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photo-comments", photoId] });
      qc.invalidateQueries({ queryKey: ["photo-comment-count", photoId] });
      toast.success("Comment deleted");
    },
    onError: (err: any) => toast.error("Failed to delete", { description: err.message }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || isLimitReached) return;
    postMutation.mutate();
  };

  const getInitials = (name: string | null) =>
    (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  // Render body with highlighted @mentions
  const renderBody = (text: string) => {
    const parts = text.split(/(@\S+)/g);
    return parts.map((part, i) =>
      part.startsWith("@") ? (
        <span key={i} className="text-primary font-medium">{part}</span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  // Actual count to display (use fetched comments length when expanded, otherwise the count query)
  const displayCount = expanded ? comments.length : commentCount;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle className="h-3 w-3" />
        {expanded
          ? `Comments (${displayCount})`
          : <>💬 {displayCount}</>
        }
      </button>

      {expanded && (
        <div className="space-y-2 pt-1">
          {/* Comment list */}
          {comments.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2 group">
                  <Avatar className="h-5 w-5 mt-0.5 shrink-0">
                    <AvatarImage src={c.profiles?.profile_photo_url || undefined} />
                    <AvatarFallback className="text-[8px]">
                      {getInitials(c.profiles?.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium shrink-0">
                        {c.profiles?.full_name || "Unknown"}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-xs text-foreground break-words">{renderBody(c.body)}</p>
                  </div>
                  {user?.id === c.user_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={() => deleteMutation.mutate(c.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          {user && (
            <div className="space-y-1">
              {isLimitReached ? (
                <p className="text-[10px] text-destructive">
                  You've reached the comment limit for this photo. You can comment again in a few hours.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  You've used {recentUserComments} of {MAX_COMMENTS_PER_WINDOW} comments.
                </p>
              )}
              <form onSubmit={handleSubmit} className="relative">
                <div className="flex gap-1.5 items-end">
                  <div className="relative flex-1">
                    <Textarea
                      ref={textareaRef}
                      value={body}
                      onChange={handleInput}
                      onKeyDown={handleKeyDown}
                      placeholder={isLimitReached ? "Comment limit reached" : "Add a comment... Use @ to tag"}
                      rows={1}
                      className="min-h-[32px] h-8 text-xs resize-none py-1.5"
                      disabled={isLimitReached}
                    />
                    {showDropdown && (
                      <div
                        ref={dropdownRef}
                        className="absolute bottom-full left-0 mb-1 z-50 w-56 rounded-md border bg-popover shadow-lg"
                      >
                        <div className="py-1 max-h-40 overflow-y-auto">
                          {filteredUsers.map((mu, i) => (
                            <button
                              key={mu.id}
                              type="button"
                              className={`w-full text-left px-3 py-1.5 text-xs flex flex-col hover:bg-accent transition-colors ${
                                i === mentionIndex ? "bg-accent" : ""
                              }`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                insertMention(mu);
                              }}
                              onMouseEnter={() => setMentionIndex(i)}
                            >
                              <span className="font-medium text-foreground">
                                {mu.full_name || "Unnamed"}
                              </span>
                              {mu.email && (
                                <span className="text-[10px] text-muted-foreground">{mu.email}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    disabled={!body.trim() || postMutation.isPending || isLimitReached}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
