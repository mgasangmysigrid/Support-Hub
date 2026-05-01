import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Move } from "lucide-react";

interface InlineImagesProps {
  ticketId: string;
  commentId?: string | null;
}

export function InlineImages({ ticketId, commentId = null }: InlineImagesProps) {
  const { data: images } = useQuery({
    queryKey: ["inline-images", ticketId, commentId],
    queryFn: async () => {
      let query = supabase
        .from("ticket_attachments")
        .select("id, file_path, file_name, mime_type")
        .eq("ticket_id", ticketId)
        .eq("is_inline", true);

      if (commentId) {
        query = query.eq("comment_id", commentId);
      } else {
        query = query.is("comment_id", null);
      }

      const { data, error } = await query.order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (!images || images.length === 0) return null;

  return (
    <div className="space-y-3 mt-3">
      {images.map((img) => (
        <InlineImage key={img.id} filePath={img.file_path} fileName={img.file_name} />
      ))}
    </div>
  );
}

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

function InlineImage({ filePath, fileName }: { filePath: string; fileName: string }) {
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: url } = useQuery({
    queryKey: ["inline-image-url", filePath],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("ticket-attachments")
        .createSignedUrl(filePath, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 1000 * 60 * 50,
  });

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM)), []);
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setLightboxOpen(open);
    if (!open) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  }, [zoomIn, zoomOut]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Reset pan when zoom goes back to 1
  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  if (!url || error) return null;

  const canPan = zoom > 1;

  return (
    <>
      <div
        className="rounded-lg border overflow-hidden bg-muted/20 cursor-pointer"
        onClick={() => setLightboxOpen(true)}
      >
        <img
          src={url}
          alt={fileName}
          className="max-w-full max-h-[500px] object-contain"
          onError={() => setError(true)}
        />
      </div>

      <Dialog open={lightboxOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 bg-black/95 border-none flex flex-col items-center justify-center gap-2">
          <DialogTitle className="sr-only">{fileName}</DialogTitle>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-background/80 backdrop-blur rounded-lg p-1 z-10">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-foreground min-w-[3rem] text-center font-medium">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground" onClick={resetView} disabled={zoom === 1 && pan.x === 0 && pan.y === 0}>
              <RotateCcw className="h-4 w-4" />
            </Button>
            {canPan && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-1">
                <Move className="h-3 w-3" /> Drag to pan
              </span>
            )}
          </div>

          {/* Pannable + zoomable image container */}
          <div
            ref={containerRef}
            className="overflow-hidden max-w-full max-h-[78vh] flex items-center justify-center select-none"
            style={{ cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default" }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img
              src={url}
              alt={fileName}
              draggable={false}
              className="rounded transition-transform duration-150 pointer-events-none"
              style={{
                transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                transformOrigin: "center center",
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
