import { useState, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Plus } from "lucide-react";
import PhotoLightbox, { type LightboxPhoto } from "./PhotoLightbox";
import { extractHashtags } from "./CaptionEditor";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import SortablePhoto from "./SortablePhoto";

const MAX_PHOTOS = 8;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type UserPhoto = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  display_order: number;
};

interface FeaturedPhotosProps {
  profileUserId: string;
  isOwnProfile: boolean;
}

export default function FeaturedPhotos({ profileUserId, isOwnProfile }: FeaturedPhotosProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [captionText, setCaptionText] = useState("");
  const [taggedUserIds, setTaggedUserIds] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["user-photos", profileUserId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_photos")
        .select("*")
        .eq("user_id", profileUserId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as UserPhoto[];
    },
    enabled: !!profileUserId,
  });

  // Fetch profile name for lightbox
  const { data: profileData } = useQuery({
    queryKey: ["profile-basic", profileUserId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, profile_photo_url")
        .eq("id", profileUserId)
        .single();
      return data;
    },
    enabled: !!profileUserId,
  });

  const lightboxPhotos: LightboxPhoto[] = photos.map((p) => ({
    id: p.id,
    image_url: p.image_url,
    caption: p.caption,
    user_id: p.user_id,
    user_name: profileData?.full_name || "Employee",
    profile_photo_url: profileData?.profile_photo_url || null,
    created_at: p.created_at,
  }));

  const deleteMutation = useMutation({
    mutationFn: async (photo: UserPhoto) => {
      const path = new URL(photo.image_url).pathname.split("/featured-photos/")[1];
      if (path) {
        await supabase.storage.from("featured-photos").remove([decodeURIComponent(path)]);
      }
      const { error } = await supabase.from("user_photos").delete().eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-photos", profileUserId] });
      qc.invalidateQueries({ queryKey: ["home-celebrations-week"] });
      toast.success("Photo deleted");
    },
    onError: (err: any) => toast.error("Error deleting photo", { description: err.message }),
  });

  const captionMutation = useMutation({
    mutationFn: async ({ id, caption, tags }: { id: string; caption: string; tags: string[] }) => {
      const { error } = await supabase
        .from("user_photos")
        .update({ caption: caption || null } as any)
        .eq("id", id);
      if (error) throw error;

      // Sync @mention tags
      await (supabase as any).from("photo_tags").delete().eq("photo_id", id).eq("tagged_by_user_id", user!.id);

      if (tags.length > 0) {
        const tagRows = tags
          .filter((uid) => uid !== user!.id)
          .map((uid) => ({
            photo_id: id,
            tagged_user_id: uid,
            tagged_by_user_id: user!.id,
          }));
        if (tagRows.length > 0) {
          await (supabase as any).from("photo_tags").insert(tagRows);
        }
      }

      // Sync hashtags
      const hashtags = extractHashtags(caption);
      await (supabase as any).from("photo_hashtags").delete().eq("photo_id", id);
      if (hashtags.length > 0) {
        const hashRows = hashtags.map((tag) => ({ photo_id: id, tag }));
        await (supabase as any).from("photo_hashtags").insert(hashRows);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-photos", profileUserId] });
      qc.invalidateQueries({ queryKey: ["trending-hashtags"] });
      qc.invalidateQueries({ queryKey: ["hashtag-suggestions"] });
      setEditingCaption(null);
      setTaggedUserIds([]);
      toast.success("Caption updated");
    },
    onError: (err: any) => toast.error("Error updating caption", { description: err.message }),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedPhotos: UserPhoto[]) => {
      const updates = orderedPhotos.map((p, i) =>
        supabase.from("user_photos").update({ display_order: i } as any).eq("id", p.id)
      );
      await Promise.all(updates);
    },
    onError: (err: any) => {
      toast.error("Failed to reorder photos", { description: err.message });
      qc.invalidateQueries({ queryKey: ["user-photos", profileUserId] });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Unsupported file type", { description: "Please upload JPG, PNG, or WEBP." });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      try {
        toast.info("Optimizing image for upload...");
        const { optimizeImageBeforeUpload } = await import("@/lib/image-optimizer");
        const result = await optimizeImageBeforeUpload(file);
        file = result.file;
      } catch (err: any) {
        toast.error("File too large", { description: err.message || "Maximum file size is 5MB." });
        return;
      }
    }
    if (photos.length >= MAX_PHOTOS) {
      toast.error("Maximum photos reached", { description: `You can upload up to ${MAX_PHOTOS} photos.` });
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filePath = `${user!.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("featured-photos")
        .upload(filePath, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("featured-photos").getPublicUrl(filePath);

      const { error: dbError } = await supabase.from("user_photos").insert({
        user_id: user!.id,
        image_url: urlData.publicUrl,
        display_order: photos.length,
      } as any);
      if (dbError) throw dbError;

      qc.invalidateQueries({ queryKey: ["user-photos", profileUserId] });
      qc.invalidateQueries({ queryKey: ["home-celebrations-week"] });
      toast.success("Photo uploaded!");
    } catch (err: any) {
      toast.error("Upload failed", { description: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = photos.findIndex((p) => p.id === active.id);
      const newIndex = photos.findIndex((p) => p.id === over.id);
      const newOrder = arrayMove(photos, oldIndex, newIndex);

      // Optimistically update cache
      qc.setQueryData(["user-photos", profileUserId], newOrder);
      reorderMutation.mutate(newOrder);
    },
    [photos, profileUserId, qc, reorderMutation]
  );

  const startEditCaption = (photo: UserPhoto) => {
    setEditingCaption(photo.id);
    setCaptionText(photo.caption || "");
    setTaggedUserIds([]);
  };

  const saveCaption = () => {
    if (!editingCaption) return;
    captionMutation.mutate({ id: editingCaption, caption: captionText, tags: taggedUserIds });
  };

  const limitReached = photos.length >= MAX_PHOTOS;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" /> Featured Photos
            {isOwnProfile && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {photos.length} / {MAX_PHOTOS} photos
              </span>
            )}
          </CardTitle>
          {isOwnProfile && !limitReached && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-7 text-xs gap-1"
            >
              <Plus className="h-3 w-3" /> {uploading ? "Uploading…" : "Add Photo"}
            </Button>
          )}
          {isOwnProfile && limitReached && (
            <span className="text-xs text-muted-foreground">Max reached</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Camera className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {isOwnProfile ? "Share up to 8 featured photos!" : "No featured photos yet."}
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo, idx) => (
                  <SortablePhoto
                    key={photo.id}
                    photo={photo}
                    isOwnProfile={isOwnProfile}
                    isEditing={false}
                    editingCaption={editingCaption}
                    captionText={captionText}
                    captionSaving={captionMutation.isPending}
                    onStartEditCaption={startEditCaption}
                    onCancelEditCaption={() => setEditingCaption(null)}
                    onSaveCaption={saveCaption}
                    onCaptionChange={(val, ids) => {
                      setCaptionText(val);
                      setTaggedUserIds(ids);
                    }}
                    onDelete={(p) => deleteMutation.mutate(p)}
                    deleteDisabled={deleteMutation.isPending}
                    onPhotoClick={() => setLightboxIndex(idx)}
                  />
                ))}

                {isOwnProfile && !limitReached && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-muted/30 hover:bg-muted/50 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-xs">Add Photo</span>
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>

      <PhotoLightbox
        photos={lightboxPhotos}
        initialIndex={lightboxIndex >= 0 ? lightboxIndex : 0}
        open={lightboxIndex >= 0}
        onOpenChange={(open) => { if (!open) setLightboxIndex(-1); }}
      />
    </Card>
  );
}
