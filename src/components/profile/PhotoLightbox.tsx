import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { RenderCaption } from "./CaptionEditor";
import PhotoReactions from "./PhotoReactions";
import PhotoComments from "./PhotoComments";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

export interface LightboxPhoto {
  id: string;
  image_url: string;
  caption: string | null;
  user_id: string;
  user_name: string;
  profile_photo_url: string | null;
  created_at: string;
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[];
  initialIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PhotoLightbox({ photos, initialIndex, open, onOpenChange }: PhotoLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const photo = photos[index];

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : photos.length - 1));
  }, [photos.length]);

  const goNext = useCallback(() => {
    setIndex((i) => (i < photos.length - 1 ? i + 1 : 0));
  }, [photos.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, goPrev, goNext]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
  };

  if (!photo) return null;

  const getInitials = (name: string) =>
    name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl w-[95vw] h-[90vh] p-0 gap-0 overflow-hidden bg-background border-border [&>button]:hidden"
      >
        <div className="flex flex-col md:flex-row h-full">
          {/* Image area */}
          <div
            className="relative flex-1 bg-black/95 flex items-center justify-center min-h-[40vh] md:min-h-0"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Close */}
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-3 right-3 z-20 h-8 w-8 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>

            {/* Navigation arrows */}
            {photos.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 p-0 rounded-full bg-black/40 hover:bg-black/60 text-white"
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-20 h-10 w-10 p-0 rounded-full bg-black/40 hover:bg-black/60 text-white"
                  onClick={goNext}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}

            {/* Photo counter */}
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-black/50 text-white text-xs font-medium">
                {index + 1} / {photos.length}
              </div>
            )}

            <img
              key={photo.id}
              src={photo.image_url}
              alt={photo.caption || "Featured photo"}
              className="max-w-full max-h-full object-contain animate-fade-in"
            />
          </div>

          {/* Detail panel */}
          <div className="w-full md:w-[340px] lg:w-[380px] border-t md:border-t-0 md:border-l border-border flex flex-col bg-background overflow-y-auto">
            {/* Author header */}
            <div className="p-4 border-b border-border">
              <Link
                to={`/profile/${photo.user_id}`}
                className="flex items-center gap-3 group/author"
                onClick={() => onOpenChange(false)}
              >
                <Avatar className="h-10 w-10 border-2 border-primary/20">
                  <AvatarImage src={photo.profile_photo_url || undefined} />
                  <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                    {getInitials(photo.user_name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-semibold text-foreground group-hover/author:text-primary transition-colors">
                    {photo.user_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(photo.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>
            </div>

            {/* Caption */}
            {photo.caption && (
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm text-foreground leading-relaxed">
                  <RenderCaption text={photo.caption} />
                </p>
              </div>
            )}

            {/* Reactions */}
            <div className="px-4 py-3 border-b border-border">
              <PhotoReactions photoId={photo.id} />
            </div>

            {/* Comments */}
            <div className="flex-1 px-4 py-3 min-h-0">
              <PhotoComments photoId={photo.id} defaultExpanded={true} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
