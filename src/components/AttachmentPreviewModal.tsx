import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw, Move, Download, X, FileQuestion } from "lucide-react";
import { PdfInlineViewer } from "@/components/PdfInlineViewer";

interface AttachmentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileUrl: string;
  fileName: string;
  mimeType: string | null;
  uploaderName?: string;
  uploadedAt?: string;
  onDownload?: () => void;
}

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

function isImageType(mimeType: string | null, fileName: string): boolean {
  if (mimeType?.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp)$/i.test(fileName);
}

function isPdfType(mimeType: string | null, fileName: string): boolean {
  if (mimeType === "application/pdf") return true;
  return /\.pdf$/i.test(fileName);
}

export function AttachmentPreviewModal({
  open,
  onOpenChange,
  fileUrl,
  fileName,
  mimeType,
  uploaderName,
  uploadedAt,
  onDownload,
}: AttachmentPreviewModalProps) {
  const isImage = isImageType(mimeType, fileName);
  const isPdf = isPdfType(mimeType, fileName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`p-0 gap-0 border-none overflow-hidden ${
          isPdf
            ? "max-w-4xl max-h-[90vh]"
            : isImage
            ? "max-w-[90vw] max-h-[90vh] bg-black/95"
            : "max-w-md"
        }`}
      >
        <DialogTitle className="sr-only">{fileName}</DialogTitle>

        {/* Header bar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 bg-background border-b">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{fileName}</p>
            {(uploaderName || uploadedAt) && (
              <p className="text-xs text-muted-foreground truncate">
                {[uploaderName, uploadedAt].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onDownload && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDownload} title="Download">
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {isImage ? (
          <ImagePreview fileUrl={fileUrl} fileName={fileName} />
        ) : isPdf ? (
          <div className="p-4 overflow-auto max-h-[calc(90vh-3.5rem)]">
            <PdfInlineViewer fileUrl={fileUrl} fileName={fileName} />
          </div>
        ) : (
          <UnsupportedPreview fileName={fileName} onDownload={onDownload} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImagePreview({ fileUrl, fileName }: { fileUrl: string; fileName: string }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = { current: { x: 0, y: 0 } };
  const panStart = { current: { x: 0, y: 0 } };

  const zoomIn = useCallback(() => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM)), []);
  const zoomOut = useCallback(() => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM)), []);
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const canPan = zoom > 1;

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    },
    [zoomIn, zoomOut]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan };
    },
    [zoom, pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
    },
    [isDragging]
  );

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  return (
    <div className="flex flex-col items-center">
      {/* Zoom controls */}
      <div className="flex items-center gap-1 bg-background/80 backdrop-blur rounded-lg p-1 my-2 z-10">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut} disabled={zoom <= MIN_ZOOM}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-xs min-w-[3rem] text-center font-medium">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn} disabled={zoom >= MAX_ZOOM}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={resetView}
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        {canPan && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1 ml-1">
            <Move className="h-3 w-3" /> Drag to pan
          </span>
        )}
      </div>

      {/* Image */}
      <div
        className="overflow-hidden max-w-full max-h-[75vh] flex items-center justify-center select-none"
        style={{ cursor: canPan ? (isDragging ? "grabbing" : "grab") : "default" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={fileUrl}
          alt={fileName}
          draggable={false}
          className="rounded transition-transform duration-150 pointer-events-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>
  );
}

function UnsupportedPreview({ fileName, onDownload }: { fileName: string; onDownload?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
      <FileQuestion className="h-10 w-10 text-muted-foreground/60" />
      <div>
        <p className="text-sm font-medium">Preview is not available for this file type</p>
        <p className="text-xs text-muted-foreground mt-1">Please download to view <span className="font-medium">{fileName}</span></p>
      </div>
      {onDownload && (
        <Button variant="outline" size="sm" onClick={onDownload} className="mt-1">
          <Download className="h-4 w-4 mr-1.5" /> Download File
        </Button>
      )}
    </div>
  );
}
