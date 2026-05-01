import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Trash2, Pencil, GripVertical } from "lucide-react";
import PhotoReactions from "./PhotoReactions";
import PhotoComments from "./PhotoComments";
import CaptionEditor, { RenderCaption } from "./CaptionEditor";
import { usePhotoMentionBadges } from "@/hooks/usePhotoMentionBadges";

type UserPhoto = {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
  display_order: number;
};

interface SortablePhotoProps {
  photo: UserPhoto;
  isOwnProfile: boolean;
  isEditing: boolean;
  editingCaption: string | null;
  captionText: string;
  captionSaving: boolean;
  onStartEditCaption: (photo: UserPhoto) => void;
  onCancelEditCaption: () => void;
  onSaveCaption: () => void;
  onCaptionChange: (val: string, ids: string[]) => void;
  onDelete: (photo: UserPhoto) => void;
  deleteDisabled: boolean;
}

interface SortablePhotoProps {
  photo: UserPhoto;
  isOwnProfile: boolean;
  isEditing: boolean;
  editingCaption: string | null;
  captionText: string;
  captionSaving: boolean;
  onStartEditCaption: (photo: UserPhoto) => void;
  onCancelEditCaption: () => void;
  onSaveCaption: () => void;
  onCaptionChange: (val: string, ids: string[]) => void;
  onDelete: (photo: UserPhoto) => void;
  deleteDisabled: boolean;
  onPhotoClick?: (photo: UserPhoto) => void;
}

export default function SortablePhoto({
  photo,
  isOwnProfile,
  isEditing,
  editingCaption,
  captionText,
  captionSaving,
  onStartEditCaption,
  onCancelEditCaption,
  onSaveCaption,
  onCaptionChange,
  onDelete,
  deleteDisabled,
  onPhotoClick,
}: SortablePhotoProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: photo.id });

  const mentionBadges = usePhotoMentionBadges();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      <div
        className="aspect-square overflow-hidden relative cursor-pointer"
        onClick={() => onPhotoClick?.(photo)}
      >
        {mentionBadges[photo.id] > 0 && (
          <span className="absolute top-2 left-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white shadow-md">
            {mentionBadges[photo.id]}
          </span>
        )}
        {isOwnProfile && (
          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 z-10 h-7 w-7 flex items-center justify-center rounded-md bg-background/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <img
          src={photo.image_url}
          alt={photo.caption || "Featured photo"}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>

      <div className="p-3 space-y-2">
        {editingCaption === photo.id ? (
          <CaptionEditor
            value={captionText}
            onChange={onCaptionChange}
            onSave={onSaveCaption}
            onCancel={onCancelEditCaption}
            saving={captionSaving}
          />
        ) : (
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
              {photo.caption ? (
                <RenderCaption text={photo.caption} />
              ) : isOwnProfile ? (
                "Add a caption…"
              ) : (
                ""
              )}
            </p>
            {isOwnProfile && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onStartEditCaption(photo)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}

        <PhotoReactions photoId={photo.id} />
        <PhotoComments photoId={photo.id} defaultExpanded={true} />
      </div>

      {isOwnProfile && (
        <Button
          variant="destructive"
          size="sm"
          className="absolute top-2 right-2 h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
          onClick={() => onDelete(photo)}
          disabled={deleteDisabled}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
