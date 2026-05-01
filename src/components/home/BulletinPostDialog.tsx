import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { extractMentionIds, hasEveryoneMention } from "@/lib/mention-utils";
import { createBulletinMentionNotifications } from "@/lib/bulletin-notification-utils";
import MentionInput from "./MentionInput";
import { useAuth } from "@/hooks/useAuth";
import { trackActivity, ANALYTICS_EVENTS } from "@/hooks/use-activity-tracker";
import { useLocalDraft } from "@/hooks/useLocalDraft";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Upload, X, FileText, Image as ImageIcon, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface EditPost {
  id: string;
  title: string;
  audience_label: string | null;
  content_body: string;
  external_link: string | null;
  external_link_label: string | null;
  is_pinned: boolean;
  bulletin_attachments: { id: string; file_url: string; file_name: string; file_type: string; sort_order: number }[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editPost?: EditPost;
}

interface DraftData {
  title: string;
  audience: string;
  body: string;
  link: string;
  linkLabel: string;
  pinned: boolean;
  pendingFileNames: string[];
  savedAt: number;
}

const EMPTY_DRAFT: DraftData = {
  title: "",
  audience: "For all MySigrid Employees",
  body: "",
  link: "",
  linkLabel: "",
  pinned: false,
  pendingFileNames: [],
  savedAt: 0,
};

function draftKey(userId: string, editPostId?: string) {
  return editPostId
    ? `bulletin_draft_edit_${editPostId}_${userId}`
    : `bulletin_draft_new_${userId}`;
}

function draftFromEdit(post: EditPost): DraftData {
  return {
    title: post.title,
    audience: post.audience_label ?? "For all MySigrid Employees",
    body: post.content_body,
    link: post.external_link ?? "",
    linkLabel: post.external_link_label ?? "",
    pinned: post.is_pinned,
    pendingFileNames: [],
    savedAt: 0,
  };
}

export default function BulletinPostDialog({ open, onOpenChange, editPost }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEdit = !!editPost;
  const key = user ? draftKey(user.id, editPost?.id) : "bulletin_draft_anon";
  const initialDraft = isEdit && editPost ? draftFromEdit(editPost) : EMPTY_DRAFT;

  const [draft, setDraft, clearDraft] = useLocalDraft<DraftData>(key, initialDraft);

  // Track whether we showed the restore prompt
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [hasCheckedDraft, setHasCheckedDraft] = useState(false);

  // Form state derived from draft
  const [title, setTitle] = useState(draft.title);
  const [audience, setAudience] = useState(draft.audience);
  const [body, setBody] = useState(draft.body);
  const [link, setLink] = useState(draft.link);
  const [linkLabel, setLinkLabel] = useState(draft.linkLabel);
  const [pinned, setPinned] = useState(draft.pinned);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState(editPost?.bulletin_attachments ?? []);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [showEveryoneConfirm, setShowEveryoneConfirm] = useState(false);

  // On open, check if a meaningful draft exists
  useEffect(() => {
    if (!open || hasCheckedDraft) return;
    setHasCheckedDraft(true);

    const hasDraftContent = draft.savedAt > 0 && (
      draft.title.trim() !== initialDraft.title.trim() ||
      draft.body.trim() !== initialDraft.body.trim() ||
      draft.link.trim() !== initialDraft.link.trim() ||
      draft.linkLabel.trim() !== initialDraft.linkLabel.trim() ||
      draft.audience.trim() !== initialDraft.audience.trim()
    );

    if (hasDraftContent) {
      setShowRestorePrompt(true);
    }
  }, [open, hasCheckedDraft]);

  // Reset checked state when dialog closes
  useEffect(() => {
    if (!open) {
      setHasCheckedDraft(false);
      setShowRestorePrompt(false);
    }
  }, [open]);

  // Autosave draft on field changes (debounced via useLocalDraft's useEffect)
  useEffect(() => {
    if (showRestorePrompt) return; // Don't overwrite while prompting
    const timeout = setTimeout(() => {
      const hasContent = title.trim() || body.trim() || link.trim();
      if (!hasContent && !isEdit) return;
      setSaveStatus("saving");
      setDraft({
        title, audience, body, link, linkLabel, pinned,
        pendingFileNames: pendingFiles.map(f => f.name),
        savedAt: Date.now(),
      });
      setTimeout(() => setSaveStatus("saved"), 300);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [title, audience, body, link, linkLabel, pinned, pendingFiles.length]);

  const restoreDraft = () => {
    setTitle(draft.title);
    setAudience(draft.audience);
    setBody(draft.body);
    setLink(draft.link);
    setLinkLabel(draft.linkLabel);
    setPinned(draft.pinned);
    setShowRestorePrompt(false);
    if (draft.pendingFileNames.length > 0) {
      toast.info("Your text draft was restored. Please reattach files if needed.");
    }
  };

  const discardDraft = () => {
    clearDraft();
    setTitle(initialDraft.title);
    setAudience(initialDraft.audience);
    setBody(initialDraft.body);
    setLink(initialDraft.link);
    setLinkLabel(initialDraft.linkLabel);
    setPinned(initialDraft.pinned);
    setPendingFiles([]);
    setShowRestorePrompt(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const valid = files.filter((f) => {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf";
      if (!isImage && !isPdf) { toast.error(`${f.name}: only images and PDFs are allowed`); return false; }
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name}: max 10MB`); return false; }
      return true;
    });
    setPendingFiles((prev) => [...prev, ...valid]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFile = async (rawFile: File, postId: string) => {
    let file = rawFile;
    if (file.type.startsWith("image/") && file.size > 5 * 1024 * 1024) {
      try {
        const { optimizeImageBeforeUpload } = await import("@/lib/image-optimizer");
        const result = await optimizeImageBeforeUpload(file);
        file = result.file;
      } catch { /* proceed with original */ }
    }
    const ext = file.name.split(".").pop();
    const path = `${postId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("bulletin-attachments").upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("bulletin-attachments").getPublicUrl(path);
    return { file_url: urlData.publicUrl, file_name: file.name, file_type: file.type.startsWith("image/") ? "image" : "pdf" };
  };

  const handleSaveClick = () => {
    if (!title.trim() || !body.trim()) { toast.error("Title and content are required"); return; }
    if (hasEveryoneMention(body.trim())) {
      setShowEveryoneConfirm(true);
      return;
    }
    handleSave();
  };

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return;
    if (!user) return;
    if (!user) return;
    setSaving(true);
    try {
      let postId = editPost?.id;
      const contentBody = body.trim();
      const everyoneMentioned = hasEveryoneMention(contentBody);
      const postData = {
        title: title.trim(), audience_label: audience.trim() || null,
        content_body: contentBody, external_link: link.trim() || null,
        external_link_label: linkLabel.trim() || null, is_pinned: pinned,
        mentions_everyone: everyoneMentioned,
        updated_at: new Date().toISOString(),
      };
      if (isEdit && postId) {
        const { error } = await supabase.from("bulletin_posts").update(postData).eq("id", postId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("bulletin_posts").insert({ ...postData, author_user_id: user.id }).select("id").single();
        if (error) throw error;
        postId = data.id;
      }
      if (removedAttachmentIds.length > 0) {
        await supabase.from("bulletin_attachments").delete().in("id", removedAttachmentIds);
      }
      if (pendingFiles.length > 0 && postId) {
        const uploaded = await Promise.all(pendingFiles.map((f) => uploadFile(f, postId!)));
        const attachRows = uploaded.map((u, i) => ({
          bulletin_post_id: postId!, file_url: u.file_url, file_name: u.file_name,
          file_type: u.file_type, sort_order: (existingAttachments.length - removedAttachmentIds.length) + i,
        }));
        if (attachRows.length > 0) {
          const { error } = await supabase.from("bulletin_attachments").insert(attachRows);
          if (error) throw error;
        }
      }
      // Sync post mentions (delete old, insert new)
      if (postId) {
        const mentionIds = extractMentionIds(body.trim());
        await supabase.from("bulletin_mentions").delete().eq("bulletin_post_id", postId);
        if (mentionIds.length > 0) {
          await supabase.from("bulletin_mentions").insert(
            mentionIds.map((uid) => ({ bulletin_post_id: postId!, mentioned_user_id: uid }))
          );
        }

        // Create mention notifications (only for new posts, not edits, to avoid duplicates)
        if (!isEdit) {
          await createBulletinMentionNotifications({
            postId: postId!,
            postTitle: title.trim(),
            actorId: user.id,
            mentionedUserIds: mentionIds,
            isEveryone: everyoneMentioned,
            type: "bulletin_mention",
          });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["bulletin-posts"] });
      toast.success(isEdit ? "Post updated" : "Post published");
      if (!isEdit && user) trackActivity(user.id, ANALYTICS_EVENTS.POSTED_UPDATE.module, ANALYTICS_EVENTS.POSTED_UPDATE.event, "bulletin_post");
      clearDraft();
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("EVERYONE_LIMIT_EXCEEDED")) {
        toast.error("You have reached the daily limit for @everyone (3 per day).");
      } else {
        toast.error(msg || "Failed to save post");
      }
    } finally {
      setSaving(false);
    }
  };

  // Restore prompt overlay
  if (open && showRestorePrompt) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Unsaved Draft Found</DialogTitle>
            <DialogDescription>
              You have an unsaved draft from {format(new Date(draft.savedAt), "MMM d, h:mm a")}. Would you like to continue where you left off?
            </DialogDescription>
          </DialogHeader>
          {draft.pendingFileNames.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Note: {draft.pendingFileNames.length} file(s) will need to be reattached.
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={discardDraft}>Discard Draft</Button>
            <Button onClick={restoreDraft}>Restore Draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Post" : "New Bulletin Post"}</DialogTitle>
          <DialogDescription className="flex items-center justify-between">
            <span>{isEdit ? "Update announcement details." : "Create a company announcement."}</span>
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Saving…</span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3 w-3" />Draft saved</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" />
          </div>
          <div className="space-y-1.5">
            <Label>Audience</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. For all MySigrid Employees" />
          </div>
          <div className="space-y-1.5">
            <Label>Content *</Label>
            <MentionInput value={body} onChange={setBody} placeholder="Write your announcement… Use @ to mention" rows={6} showEveryone />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>External Link</Label>
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label>Link Label</Label>
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Open Link" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={pinned} onCheckedChange={setPinned} />
            <Label>Pin to top</Label>
          </div>

          {existingAttachments.filter((a) => !removedAttachmentIds.includes(a.id)).length > 0 && (
            <div className="space-y-1.5">
              <Label>Existing Attachments</Label>
              <div className="flex flex-wrap gap-2">
                {existingAttachments.filter((a) => !removedAttachmentIds.includes(a.id)).map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-xs">
                    {a.file_type === "image" ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                    <span className="truncate max-w-[120px]">{a.file_name}</span>
                    <button onClick={() => setRemovedAttachmentIds((p) => [...p, a.id])} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Attachments</Label>
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-muted rounded px-2 py-1 text-xs">
                  {f.type.startsWith("image/") ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                  <span className="truncate max-w-[120px]">{f.name}</span>
                  <button onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-3 w-3 mr-1" /> Add Files
              </Button>
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={handleFileSelect} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSaveClick} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Publish"}</Button>
        </DialogFooter>

        <AlertDialog open={showEveryoneConfirm} onOpenChange={setShowEveryoneConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Notify all employees?</AlertDialogTitle>
              <AlertDialogDescription>
                This post contains @everyone and will send a notification to all employees. Continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => { setShowEveryoneConfirm(false); handleSave(); }}>
                Yes, notify everyone
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
