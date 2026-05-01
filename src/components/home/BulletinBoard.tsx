import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Megaphone, Plus, Archive, ArchiveRestore, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import BulletinPostDialog from "./BulletinPostDialog";
import BulletinDetailDialog from "./BulletinDetailDialog";
import BulletinCard from "./BulletinCard";
import type { UnreadBulletin, BulletinMentionNotification } from "@/hooks/useHomeUnreads";

const AUTHORIZED_IDS = [
  "ebcc22a7-86ca-423e-ba47-6c06452c0249",
  "32e61f10-5d29-40a2-adea-1d2894fea6d4",
];

export interface BulletinPost {
  id: string;
  title: string;
  audience_label: string | null;
  content_body: string;
  author_user_id: string;
  external_link: string | null;
  external_link_label: string | null;
  status: string;
  is_pinned: boolean;
  mentions_everyone?: boolean;
  created_at: string;
  updated_at: string;
  profiles: { full_name: string | null; profile_photo_url: string | null } | null;
  bulletin_attachments: { id: string; file_url: string; file_name: string; file_type: string; sort_order: number }[];
}

interface BulletinBoardProps {
  unreadBulletins?: UnreadBulletin[];
  deepLinkPostId?: string | null;
  deepLinkCommentId?: string | null;
  bulletinMentionsByPost?: Map<string, BulletinMentionNotification[]>;
}

export default function BulletinBoard({
  unreadBulletins = [],
  deepLinkPostId,
  deepLinkCommentId,
  bulletinMentionsByPost = new Map(),
}: BulletinBoardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editPost, setEditPost] = useState<BulletinPost | null>(null);
  const [viewPost, setViewPost] = useState<BulletinPost | null>(null);
  const [viewCommentId, setViewCommentId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const canPost = user ? AUTHORIZED_IDS.includes(user.id) : false;
  const unreadIds = useMemo(() => new Set(unreadBulletins.map((b) => b.id)), [unreadBulletins]);

  const totalMentionCount = useMemo(() => {
    let count = 0;
    bulletinMentionsByPost.forEach((mentions) => { count += mentions.length; });
    return count;
  }, [bulletinMentionsByPost]);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["bulletin-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bulletin_posts")
        .select("*, mentions_everyone, profiles!bulletin_posts_author_user_id_fkey(full_name, profile_photo_url), bulletin_attachments(*)")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BulletinPost[];
    },
  });

  // Deep link handling
  useEffect(() => {
    if (!deepLinkPostId || deepLinkHandled || isLoading || posts.length === 0) return;
    const targetPost = posts.find((p) => p.id === deepLinkPostId);
    if (targetPost) {
      console.log(`[bulletin-deep-link] Found post "${targetPost.title}", opening detail view`);
      setViewPost(targetPost);
      setViewCommentId(deepLinkCommentId || null);
      setDeepLinkHandled(true);
      setTimeout(() => {
        const section = document.getElementById("section-bulletin");
        if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    } else {
      console.log(`[bulletin-deep-link] Post ${deepLinkPostId} not found in loaded posts`);
      setDeepLinkHandled(true);
    }
  }, [deepLinkPostId, deepLinkCommentId, posts, isLoading, deepLinkHandled]);

  const markAsRead = useMutation({
    mutationFn: async (postId: string) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("bulletin_reads")
        .upsert(
          { user_id: user!.id, bulletin_post_id: postId, read_at: now },
          { onConflict: "user_id,bulletin_post_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["home-unreads-bulletin-reads", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["bulletin-reads", user?.id] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("bulletin_posts")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bulletin-posts"] });
      queryClient.invalidateQueries({ queryKey: ["home-unreads-bulletins"] });
      toast.success("Post updated");
    },
  });

  const filteredPosts = useMemo(() => {
    const base = posts.filter((p) => (showArchived ? p.status === "archived" : p.status === "active"));
    // Prioritize: unread first, then pinned, then newest
    return [...base].sort((a, b) => {
      const aUnread = unreadIds.has(a.id) ? 1 : 0;
      const bUnread = unreadIds.has(b.id) ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      const aPin = a.is_pinned ? 1 : 0;
      const bPin = b.is_pinned ? 1 : 0;
      if (aPin !== bPin) return bPin - aPin;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [posts, showArchived, unreadIds]);

  const handleViewPost = (post: BulletinPost) => {
    setViewPost(post);
    setViewCommentId(null);
    if (user) markAsRead.mutate(post.id);
  };

  const handleCloseDetail = () => {
    setViewPost(null);
    setViewCommentId(null);
  };

  const visibleUnreadCount = useMemo(
    () => filteredPosts.filter((p) => unreadIds.has(p.id)).length,
    [filteredPosts, unreadIds]
  );

  return (
    <div id="section-bulletin" className="flex flex-col">
      {/* Board container */}
      <div className="rounded-2xl bg-[hsl(220,14%,96%)] border border-[hsl(220,13%,91%)] p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-[3px] h-5 rounded-full bg-primary" />
            <Megaphone className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-foreground">
              MySigrid Updates
            </h2>
            {visibleUnreadCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground animate-pulse">
                {visibleUnreadCount}
              </span>
            )}
            {totalMentionCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                <AtSign className="h-2.5 w-2.5" />
                {totalMentionCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {canPost && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 px-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowArchived(!showArchived)}
                >
                  {showArchived ? <ArchiveRestore className="h-3.5 w-3.5 mr-1" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
                  {showArchived ? "Active" : "Archived"}
                </Button>
                <Button size="sm" className="h-7 px-3 text-xs font-medium" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> New Post
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Thin divider */}
        <div className="h-px bg-border/60 mb-4" />

        {/* Masonry Board */}
        {isLoading ? (
          <div className="p-12 text-sm text-muted-foreground text-center">Loading…</div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground rounded-xl border border-dashed border-border bg-white/60">
            {showArchived ? "No archived posts" : "No announcements yet"}
          </div>
        ) : (
          <div className="columns-1 md:columns-2 xl:columns-4" style={{ columnGap: 12 }}>
            {filteredPosts.map((post) => (
              <div key={post.id} className="break-inside-avoid" style={{ marginBottom: 12 }}>
                <BulletinCard
                  post={post}
                  isNew={unreadIds.has(post.id)}
                  isMentioned={bulletinMentionsByPost.has(post.id)}
                  canPost={canPost}
                  onView={() => handleViewPost(post)}
                  onEdit={() => setEditPost(post)}
                  onArchiveToggle={() =>
                    archiveMutation.mutate({
                      id: post.id,
                      status: post.status === "active" ? "archived" : "active",
                    })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {showCreate && (
        <BulletinPostDialog open={showCreate} onOpenChange={setShowCreate} />
      )}
      {editPost && (
        <BulletinPostDialog open={!!editPost} onOpenChange={() => setEditPost(null)} editPost={editPost} />
      )}
      {viewPost && (
        <BulletinDetailDialog
          open={!!viewPost}
          onOpenChange={handleCloseDetail}
          post={viewPost}
          highlightCommentId={viewCommentId}
          mentionNotifications={bulletinMentionsByPost.get(viewPost.id)}
        />
      )}
    </div>
  );
}
