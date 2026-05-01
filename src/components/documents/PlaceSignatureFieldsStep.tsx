import { useState, useRef, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PenTool, Trash2, FileText, ArrowLeft, Upload, MousePointerClick,
  Mail, User, Building2, Briefcase,
} from "lucide-react";
import { toast } from "sonner";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const RENDER_WIDTH = 620;

export interface PlacedField {
  id: string;
  signer_user_id: string;
  signer_name: string;
  page_number: number;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  field_type: string;
}

interface PageDims {
  width: number;
  height: number;
}

interface Signer {
  user_id: string;
  name: string;
  role: string;
  order: number;
}

interface Props {
  fileUrl: string;
  fileName: string;
  signers: Signer[];
  onBack: () => void;
  onSubmit: (fields: PlacedField[]) => void;
  submitting: boolean;
}

// Field type definitions — simplified (no initial, no date_signed)
const FIELD_TYPES = [
  { type: "signature", label: "Signature", icon: PenTool, category: "Signature", width: 200, height: 60 },
] as const;

const CONTACT_FIELDS = [
  { type: "name", label: "Name", icon: User, category: "Contact Information", width: 180, height: 30 },
  { type: "email", label: "Email", icon: Mail, category: "Contact Information", width: 200, height: 30 },
  { type: "company", label: "Company", icon: Building2, category: "Contact Information", width: 180, height: 30 },
  { type: "title", label: "Title", icon: Briefcase, category: "Contact Information", width: 150, height: 30 },
] as const;

const ALL_FIELD_TYPES = [...FIELD_TYPES, ...CONTACT_FIELDS];

const SIGNER_COLORS = [
  { bg: "bg-blue-500/15", border: "border-blue-500", text: "text-blue-700", dot: "bg-blue-500", accent: "hsl(217, 91%, 60%)" },
  { bg: "bg-emerald-500/15", border: "border-emerald-500", text: "text-emerald-700", dot: "bg-emerald-500", accent: "hsl(160, 84%, 39%)" },
  { bg: "bg-purple-500/15", border: "border-purple-500", text: "text-purple-700", dot: "bg-purple-500", accent: "hsl(271, 91%, 65%)" },
  { bg: "bg-orange-500/15", border: "border-orange-500", text: "text-orange-700", dot: "bg-orange-500", accent: "hsl(25, 95%, 53%)" },
  { bg: "bg-pink-500/15", border: "border-pink-500", text: "text-pink-700", dot: "bg-pink-500", accent: "hsl(330, 81%, 60%)" },
  { bg: "bg-cyan-500/15", border: "border-cyan-500", text: "text-cyan-700", dot: "bg-cyan-500", accent: "hsl(189, 94%, 43%)" },
];

export default function PlaceSignatureFieldsStep({
  fileUrl, fileName, signers, onBack, onSubmit, submitting
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState<Record<number, PageDims>>({});
  const [placedFields, setPlacedFields] = useState<PlacedField[]>([]);
  const [activeSignerId, setActiveSignerId] = useState<string>(signers[0]?.user_id || "");
  const [activeFieldType, setActiveFieldType] = useState<string>("signature");
  const [imgDims, setImgDims] = useState<PageDims | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ fieldId: string; startX: number; startY: number; origX: number; origY: number; dims: PageDims } | null>(null);
  const [didDrag, setDidDrag] = useState(false);

  const isPdf = fileName?.toLowerCase().endsWith(".pdf");
  const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName || "");

  const getSignerColor = (userId: string) => {
    const idx = signers.findIndex(s => s.user_id === userId);
    return SIGNER_COLORS[idx % SIGNER_COLORS.length];
  };

  const activeSigner = signers.find(s => s.user_id === activeSignerId);
  const activeFieldDef = ALL_FIELD_TYPES.find(f => f.type === activeFieldType) || ALL_FIELD_TYPES[0];

  // Keyboard delete handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFieldId) {
        // Don't delete if user is typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        removeField(selectedFieldId);
        setSelectedFieldId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFieldId]);

  const handleDocumentClick = (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    // If we just finished dragging, don't create a new field
    if (didDrag) return;
    if (!activeSignerId) {
      toast.info("Select a signer first");
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const dims = isPdf ? pageDims[pageNum] : imgDims;
    if (!dims) return;

    const displayWidth = rect.width;
    const displayHeight = rect.height;

    const xOrig = (clickX / displayWidth) * dims.width;
    const yOrig = (clickY / displayHeight) * dims.height;

    const fieldW = activeFieldDef.width;
    const fieldH = activeFieldDef.height;

    const xPos = Math.max(0, Math.min(xOrig - fieldW / 2, dims.width - fieldW));
    const yPos = Math.max(0, Math.min(yOrig - fieldH / 2, dims.height - fieldH));

    const signerName = activeSigner?.name || "Unknown";
    const newId = `field-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    setPlacedFields(prev => [
      ...prev,
      {
        id: newId,
        signer_user_id: activeSignerId,
        signer_name: signerName,
        page_number: pageNum,
        x_position: xPos,
        y_position: yPos,
        width: fieldW,
        height: fieldH,
        field_type: activeFieldType,
      },
    ]);
    setSelectedFieldId(newId);
  };

  const removeField = (fieldId: string) => {
    setPlacedFields(prev => prev.filter(f => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
  };

  const handleDragStart = (e: React.MouseEvent, fieldId: string, dims: PageDims) => {
    e.stopPropagation();
    e.preventDefault();
    const field = placedFields.find(f => f.id === fieldId);
    if (!field) return;
    setDragging({ fieldId, startX: e.clientX, startY: e.clientY, origX: field.x_position, origY: field.y_position, dims });
    setDidDrag(false);
    setSelectedFieldId(fieldId);
  };

  const handleDragMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { fieldId, startX, startY, origX, origY, dims } = dragging;
    const field = placedFields.find(f => f.id === fieldId);
    if (!field) return;

    const dx = ((e.clientX - startX) / rect.width) * dims.width;
    const dy = ((e.clientY - startY) / rect.height) * dims.height;

    // Mark as dragged if moved more than 3px
    if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) {
      setDidDrag(true);
    }

    const newX = Math.max(0, Math.min(origX + dx, dims.width - field.width));
    const newY = Math.max(0, Math.min(origY + dy, dims.height - field.height));

    setPlacedFields(prev => prev.map(f => f.id === fieldId ? { ...f, x_position: newX, y_position: newY } : f));
  }, [dragging, placedFields]);

  const handleDragEnd = useCallback(() => {
    if (dragging) {
      // Use a microtask to keep didDrag true during the click event
      setTimeout(() => setDidDrag(false), 50);
    }
    setDragging(null);
  }, [dragging]);

  const handleSubmit = () => {
    const signersWithFields = new Set(placedFields.map(f => f.signer_user_id));
    const missingSigners = signers.filter(s => !signersWithFields.has(s.user_id));
    if (missingSigners.length > 0) {
      toast.error(`Please place at least one field for: ${missingSigners.map(s => s.name).join(", ")}`);
      return;
    }
    onSubmit(placedFields);
  };

  const getFieldIcon = (fieldType: string) => {
    const def = ALL_FIELD_TYPES.find(f => f.type === fieldType);
    return def ? def.icon : PenTool;
  };

  const getFieldLabel = (fieldType: string) => {
    const def = ALL_FIELD_TYPES.find(f => f.type === fieldType);
    return def ? def.label : fieldType;
  };

  const renderFieldOverlay = (field: PlacedField, dims: PageDims) => {
    const color = getSignerColor(field.signer_user_id);
    const FieldIcon = getFieldIcon(field.field_type);
    const isDraggingThis = dragging?.fieldId === field.id;
    const isSelected = selectedFieldId === field.id;
    const style = {
      left: `${(field.x_position / dims.width) * 100}%`,
      top: `${(field.y_position / dims.height) * 100}%`,
      width: `${(field.width / dims.width) * 100}%`,
      height: `${(field.height / dims.height) * 100}%`,
      cursor: isDraggingThis ? 'grabbing' : 'grab',
      zIndex: isDraggingThis ? 50 : isSelected ? 40 : 10,
      opacity: isDraggingThis ? 0.85 : 1,
    };

    return (
      <div
        key={field.id}
        className={`absolute rounded border-2 ${isSelected ? 'border-solid ring-2 ring-primary/40' : 'border-dashed'} ${color.border} ${color.bg} group transition-shadow hover:shadow-md select-none`}
        style={style}
        onMouseDown={(e) => handleDragStart(e, field.id, dims)}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedFieldId(field.id);
        }}
        title={`${field.signer_name} — ${getFieldLabel(field.field_type)}`}
      >
        <div className="flex items-center justify-center h-full gap-1 px-1 overflow-hidden pointer-events-none">
          <FieldIcon className={`h-3 w-3 ${color.text} shrink-0`} />
          <span className={`text-[10px] font-semibold ${color.text} truncate`}>
            {getFieldLabel(field.field_type)}
          </span>
        </div>
        {/* Delete button — visible on hover or when selected */}
        <button
          className={`absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={(e) => {
            e.stopPropagation();
            removeField(field.id);
          }}
          title="Remove field"
        >
          <Trash2 className="h-2.5 w-2.5" />
        </button>
      </div>
    );
  };

  const fieldsPerSigner = signers.map(s => ({
    ...s,
    count: placedFields.filter(f => f.signer_user_id === s.user_id).length,
  }));

  return (
    <div className="flex gap-4 min-h-[60vh]">
      {/* Left sidebar */}
      <div className="w-[220px] shrink-0 space-y-4 border-r pr-4">
        {/* Signer selector */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signer</Label>
          <Select value={activeSignerId} onValueChange={setActiveSignerId}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {signers.map((s, idx) => {
                const color = SIGNER_COLORS[idx % SIGNER_COLORS.length];
                return (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${color.dot} inline-block`} />
                      {s.name}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Signature fields */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signature</Label>
          <div className="grid grid-cols-1 gap-1.5">
            {FIELD_TYPES.map((ft) => {
              const Icon = ft.icon;
              const isActive = activeFieldType === ft.type;
              const color = getSignerColor(activeSignerId);
              return (
                <button
                  key={ft.type}
                  onClick={() => setActiveFieldType(ft.type)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-xs transition-all ${
                    isActive
                      ? `${color.border} ${color.bg} shadow-sm`
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? color.text : "text-muted-foreground"}`} />
                  <span className={`font-medium ${isActive ? color.text : ""}`}>{ft.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Contact fields */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact Information</Label>
          <div className="grid grid-cols-2 gap-1.5">
            {CONTACT_FIELDS.map((ft) => {
              const Icon = ft.icon;
              const isActive = activeFieldType === ft.type;
              const color = getSignerColor(activeSignerId);
              return (
                <button
                  key={ft.type}
                  onClick={() => setActiveFieldType(ft.type)}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2.5 text-xs transition-all ${
                    isActive
                      ? `${color.border} ${color.bg} shadow-sm`
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? color.text : "text-muted-foreground"}`} />
                  <span className={`font-medium leading-tight text-center ${isActive ? color.text : ""}`}>{ft.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Placed fields summary */}
        {placedFields.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Placed Fields</Label>
            <div className="space-y-1">
              {fieldsPerSigner.map((s, idx) => {
                const color = SIGNER_COLORS[idx % SIGNER_COLORS.length];
                return (
                  <div key={s.user_id} className="flex items-center gap-1.5 text-xs">
                    <span className={`w-2 h-2 rounded-full ${color.dot}`} />
                    <span className="truncate flex-1">{s.name}</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {s.count}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onBack} className="w-full gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || placedFields.length === 0}
            className="w-full gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            {submitting ? "Issuing…" : "Issue Document"}
          </Button>
        </div>
      </div>

      {/* Right — document preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5" />
          Click to place · Drag to reposition · Select + Delete key or trash icon to remove
        </div>

        <div className="rounded-lg border bg-muted/20 overflow-auto max-h-[55vh]">
          {isPdf ? (
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages }) => setNumPages(numPages)}
              loading={<p className="text-sm text-muted-foreground p-4">Loading PDF…</p>}
              error={
                <div className="flex flex-col items-center py-8 gap-2">
                  <FileText className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Could not load PDF preview</p>
                </div>
              }
            >
              <div className="space-y-3 p-3">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                  <div
                    key={pageNum}
                    className="relative mx-auto"
                    style={{ width: RENDER_WIDTH, cursor: dragging ? 'grabbing' : 'crosshair' }}
                    onClick={(e) => handleDocumentClick(e, pageNum)}
                    onMouseMove={handleDragMove}
                    onMouseUp={handleDragEnd}
                    onMouseLeave={handleDragEnd}
                  >
                    <Page
                      pageNumber={pageNum}
                      width={RENDER_WIDTH}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                      onLoadSuccess={(page) => {
                        const vp = page.getViewport({ scale: 1 });
                        setPageDims(prev => ({
                          ...prev,
                          [pageNum]: { width: vp.width, height: vp.height },
                        }));
                      }}
                    />
                    <div className="absolute top-1 right-1 bg-background/80 text-[10px] text-muted-foreground px-1.5 py-0.5 rounded">
                      Page {pageNum}
                    </div>
                    {pageDims[pageNum] &&
                      placedFields
                        .filter(f => f.page_number === pageNum)
                        .map(f => renderFieldOverlay(f, pageDims[pageNum]))}
                  </div>
                ))}
              </div>
            </Document>
          ) : isImage ? (
            <div
              className="relative inline-block"
              style={{ cursor: dragging ? 'grabbing' : 'crosshair' }}
              onClick={(e) => handleDocumentClick(e, 1)}
              onMouseMove={handleDragMove}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
            >
              <img
                src={fileUrl}
                alt={fileName}
                className="max-w-full"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImgDims({ width: img.naturalWidth, height: img.naturalHeight });
                  setNumPages(1);
                }}
              />
              {imgDims &&
                placedFields
                  .filter(f => f.page_number === 1)
                  .map(f => renderFieldOverlay(f, imgDims))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <FileText className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
