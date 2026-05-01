import { useState, useRef, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PenTool, RotateCcw, Upload, Check, MousePointerClick, FileText, Type } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const RENDER_WIDTH = 700;

const SIGNATURE_FONTS = [
  { id: "dancing", name: "Dancing Script", family: "'Dancing Script', cursive", url: "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" },
  { id: "great-vibes", name: "Great Vibes", family: "'Great Vibes', cursive", url: "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap" },
  { id: "pacifico", name: "Pacifico", family: "'Pacifico', cursive", url: "https://fonts.googleapis.com/css2?family=Pacifico&display=swap" },
  { id: "sacramento", name: "Sacramento", family: "'Sacramento', cursive", url: "https://fonts.googleapis.com/css2?family=Sacramento&display=swap" },
  { id: "alex-brush", name: "Alex Brush", family: "'Alex Brush', cursive", url: "https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap" },
];

// Load Google Fonts for typed signatures
const loadedFonts = new Set<string>();
function loadSignatureFont(font: typeof SIGNATURE_FONTS[0]) {
  if (loadedFonts.has(font.id)) return;
  loadedFonts.add(font.id);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = font.url;
  document.head.appendChild(link);
}

// Preload all signature fonts
SIGNATURE_FONTS.forEach(loadSignatureFont);

interface SignatureField {
  id: string;
  page_number: number;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  field_type: string;
  completed: boolean;
}

interface PageDims {
  width: number;
  height: number;
}

interface Props {
  fileUrl: string;
  isPdf: boolean;
  isImage: boolean;
  fileName: string;
  fields: SignatureField[];
  savedSignature?: string | null;
  signerName?: string;
  onComplete: (signatureData: string, signedFieldIds: string[]) => void;
  onSaveSignature?: (signatureData: string) => void;
  signing: boolean;
}

// --- Smooth drawing helpers ---
interface Point { x: number; y: number; t: number; }

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
): Point {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
    t: Date.now(),
  };
}

function midPoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: (a.t + b.t) / 2 };
}

export default function SignableDocumentView({
  fileUrl, isPdf, isImage, fileName, fields,
  savedSignature, signerName, onComplete, onSaveSignature, signing
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState<Record<number, PageDims>>({});
  const [capturedSig, setCapturedSig] = useState<string | null>(null);
  const [signedFields, setSignedFields] = useState<Set<string>>(new Set());
  const [showCapture, setShowCapture] = useState(false);
  const [signMethod, setSignMethod] = useState<"draw" | "upload" | "saved" | "type">(
    savedSignature ? "saved" : "draw"
  );
  const [uploadedSig, setUploadedSig] = useState<string | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [imgDims, setImgDims] = useState<PageDims | null>(null);

  // Type signature state
  const [typedName, setTypedName] = useState(signerName || "");
  const [selectedFont, setSelectedFont] = useState(SIGNATURE_FONTS[0].id);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const typeCanvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const pointsRef = useRef<Point[]>([]);

  const effectiveFields: SignatureField[] = fields;

  // --- Draw canvas init ---
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    pointsRef.current = [];
  }, []);

  useEffect(() => {
    if (showCapture && signMethod === "draw") {
      setTimeout(initCanvas, 100);
    }
  }, [showCapture, signMethod, initCanvas]);

  // Auto-show capture on first render
  useEffect(() => {
    if (!capturedSig) setShowCapture(true);
  }, [capturedSig]);

  // --- Smooth drawing ---
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    setHasDrawn(true);
    const pt = getCanvasPoint(canvas, e);
    pointsRef.current = [pt];
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pt = getCanvasPoint(canvas, e);
    const pts = pointsRef.current;
    pts.push(pt);

    if (pts.length < 3) return;

    const p0 = pts[pts.length - 3];
    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    // Velocity-based line width for natural feel
    const dx = p2.x - p0.x;
    const dy = p2.y - p0.y;
    const dt = Math.max(p2.t - p0.t, 1);
    const velocity = Math.sqrt(dx * dx + dy * dy) / dt;
    const lineWidth = Math.max(1.5, Math.min(4.5, 4.5 - velocity * 1.2));

    ctx.lineWidth = lineWidth;

    // Quadratic bezier through midpoints for smoothness
    const mid1 = midPoint(p0, p1);
    const mid2 = midPoint(p1, p2);

    ctx.beginPath();
    ctx.moveTo(mid1.x, mid1.y);
    ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
    pointsRef.current = [];
  };

  const clearCanvas = () => {
    setHasDrawn(false);
    initCanvas();
  };

  // --- Type signature rendering ---
  const renderTypedSignature = useCallback(() => {
    const canvas = typeCanvasRef.current;
    if (!canvas || !typedName.trim()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const font = SIGNATURE_FONTS.find(f => f.id === selectedFont) || SIGNATURE_FONTS[0];
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);

    // Calculate font size to fit
    let fontSize = 52;
    ctx.font = `${fontSize}px ${font.family}`;
    let textWidth = ctx.measureText(typedName).width;
    while (textWidth > w - 40 && fontSize > 16) {
      fontSize -= 2;
      ctx.font = `${fontSize}px ${font.family}`;
      textWidth = ctx.measureText(typedName).width;
    }

    ctx.fillStyle = "#1a1a2e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, w / 2, h / 2 + 4);
  }, [typedName, selectedFont]);

  useEffect(() => {
    if (signMethod === "type") {
      // Small delay to allow font loading
      const timer = setTimeout(renderTypedSignature, 150);
      return () => clearTimeout(timer);
    }
  }, [signMethod, typedName, selectedFont, renderTypedSignature]);

  // --- Upload handler ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Signature image must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUploadedSig(reader.result as string);
    reader.readAsDataURL(file);
  };

  // --- Capture signature ---
  const captureSignature = () => {
    let sigData: string | null = null;
    if (signMethod === "saved" && savedSignature) sigData = savedSignature;
    else if (signMethod === "upload" && uploadedSig) sigData = uploadedSig;
    else if (signMethod === "type" && typedName.trim() && typeCanvasRef.current) {
      sigData = typeCanvasRef.current.toDataURL("image/png");
    } else if (signMethod === "draw" && hasDrawn && canvasRef.current) {
      sigData = canvasRef.current.toDataURL("image/png");
    }
    if (!sigData) {
      toast.error("Please provide your signature first");
      return;
    }
    setCapturedSig(sigData);
    setShowCapture(false);
    toast.success("Signature captured! Now click the 'Sign Here' fields on the document to place it.");
  };

  const handleFieldClick = (fieldId: string) => {
    if (!capturedSig) {
      setShowCapture(true);
      toast.info("Prepare your signature first, then click the field to place it.");
      return;
    }
    setSignedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  };

  const handleComplete = () => {
    if (!capturedSig) {
      toast.error("Please capture and place your signature first");
      return;
    }
    const signedIds = Array.from(signedFields);
    if (signedIds.length === 0) {
      toast.error("Please click on the signature fields to place your signature");
      return;
    }
    onComplete(capturedSig, signedIds);
  };

  const getFieldStyle = (field: SignatureField, dims: PageDims) => ({
    left: `${(field.x_position / dims.width) * 100}%`,
    top: `${(field.y_position / dims.height) * 100}%`,
    width: `${(field.width / dims.width) * 100}%`,
    height: `${(field.height / dims.height) * 100}%`,
  });

  const allFieldsSigned = effectiveFields.length > 0 && effectiveFields.every(f => signedFields.has(f.id));
  const canComplete = capturedSig && allFieldsSigned;

  const renderFieldOverlay = (field: SignatureField, dims: PageDims) => {
    const isSigned = signedFields.has(field.id);
    const style = getFieldStyle(field, dims);
    const isSignatureType = field.field_type === "signature";

    return (
      <div
        key={field.id}
        className={`absolute cursor-pointer transition-all duration-200 rounded ${
          isSigned
            ? "border-2 border-green-500 bg-green-50/30"
            : "border-2 border-dashed border-amber-500 bg-amber-50/60 hover:bg-amber-100/80 hover:border-amber-600"
        }`}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          handleFieldClick(field.id);
        }}
      >
        {isSigned && capturedSig ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            {isSignatureType ? (
              <>
                <img
                  src={capturedSig}
                  alt="Your signature"
                  className="w-full h-[60%] object-contain p-0.5"
                />
                <div className="text-[8px] text-muted-foreground leading-tight text-center px-1">
                  <div className="font-medium text-foreground">{signerName || "Signer"}</div>
                  <div>Signed on {format(new Date(), "MMM d, yyyy")}</div>
                </div>
              </>
            ) : (
              <img
                src={capturedSig}
                alt="Your signature"
                className="w-full h-full object-contain p-0.5"
              />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full gap-1.5 px-2">
            <PenTool className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">
              Sign Here
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Signature Capture Panel */}
      {!capturedSig ? (
        <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <PenTool className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-sm">Step 1: Prepare Your Signature</h3>
          </div>

          <Tabs value={signMethod} onValueChange={(v) => setSignMethod(v as any)}>
            <TabsList className="w-full">
              {savedSignature && <TabsTrigger value="saved">Saved</TabsTrigger>}
              <TabsTrigger value="draw" className="gap-1.5">
                <PenTool className="h-3.5 w-3.5" /> Draw
              </TabsTrigger>
              <TabsTrigger value="type" className="gap-1.5">
                <Type className="h-3.5 w-3.5" /> Type
              </TabsTrigger>
              <TabsTrigger value="upload" className="gap-1.5">
                <Upload className="h-3.5 w-3.5" /> Upload
              </TabsTrigger>
            </TabsList>

            {savedSignature && (
              <TabsContent value="saved">
                <div className="rounded-lg border p-3 bg-background">
                  <p className="text-xs text-muted-foreground mb-2">Your saved signature:</p>
                  <img
                    src={savedSignature}
                    alt="Saved signature"
                    className="max-h-20 mx-auto border rounded bg-background p-1"
                  />
                </div>
              </TabsContent>
            )}

            <TabsContent value="draw">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Draw your signature below:</p>
                <div className="rounded-lg border bg-background overflow-hidden relative">
                  <canvas
                    ref={canvasRef}
                    width={880}
                    height={280}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: 140 }}
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                  {/* Guide line */}
                  <div className="absolute bottom-8 left-6 right-6 border-b border-dashed border-muted-foreground/20 pointer-events-none" />
                </div>
                <Button variant="outline" size="sm" onClick={clearCanvas} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Clear
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="type">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type your full name</Label>
                  <Input
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Your full name"
                    className="text-base"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Choose a signature style</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {SIGNATURE_FONTS.map((font) => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setSelectedFont(font.id)}
                        className={`text-left px-4 py-3 rounded-lg border transition-all ${
                          selectedFont === font.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/40 bg-background"
                        }`}
                      >
                        <span
                          className="text-2xl block"
                          style={{ fontFamily: font.family, color: "#1a1a2e" }}
                        >
                          {typedName || "Your Name"}
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block">{font.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Hidden canvas for generating the typed signature image */}
                <div className="rounded-lg border p-3 bg-background">
                  <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                  <canvas
                    ref={typeCanvasRef}
                    width={880}
                    height={200}
                    className="w-full rounded"
                    style={{ height: 100 }}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="upload">
              <div className="space-y-2">
                <Label className="text-xs">Upload signature image (PNG, JPG — max 2MB)</Label>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileUpload}
                />
                {uploadedSig && (
                  <div className="rounded-lg border p-3 bg-background">
                    <img src={uploadedSig} alt="Uploaded" className="max-h-20 mx-auto" />
                  </div>
                )}
              </div>
            </TabsContent>

            <div className="flex justify-end pt-2">
              <Button size="sm" onClick={captureSignature} className="gap-1.5">
                <Check className="h-4 w-4" /> Use This Signature
              </Button>
            </div>
          </Tabs>
        </div>
      ) : (
        <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="border rounded bg-background p-1">
              <img src={capturedSig} alt="Your signature" className="h-10 object-contain" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-800">Signature ready</p>
              <p className="text-xs text-green-600 flex items-center gap-1">
                <MousePointerClick className="h-3 w-3" />
                Click the "Sign Here" fields below to place it
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCapturedSig(null);
              setSignedFields(new Set());
            }}
            className="text-xs"
          >
            Change Signature
          </Button>
        </div>
      )}

      {/* Document with signature overlays */}
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
                <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, "_blank")}>
                  Open in New Tab
                </Button>
              </div>
            }
          >
            <div className="space-y-3 p-3">
              {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                <div
                  key={pageNum}
                  className="relative mx-auto"
                  style={{ width: RENDER_WIDTH }}
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
                  {pageDims[pageNum] &&
                    effectiveFields
                      .filter(f => f.page_number === pageNum)
                      .map(f => renderFieldOverlay(f, pageDims[pageNum]))}
                </div>
              ))}
            </div>
          </Document>
        ) : isImage ? (
          <div className="relative inline-block">
            <img
              ref={imgRef}
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
              effectiveFields
                .filter(f => f.page_number === 1)
                .map(f => renderFieldOverlay(f, imgDims))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{fileName}</p>
            <Button variant="outline" size="sm" onClick={() => window.open(fileUrl, "_blank")}>
              Open File
            </Button>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {effectiveFields.length > 0
            ? `${signedFields.size} of ${effectiveFields.length} field${effectiveFields.length > 1 ? "s" : ""} signed`
            : "No signature fields defined"}
        </div>
        <div className="flex gap-2">
          {onSaveSignature && capturedSig && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onSaveSignature(capturedSig);
                handleComplete();
              }}
              disabled={signing || !canComplete}
              className="gap-1.5"
            >
              <PenTool className="h-4 w-4" />
              {signing ? "Signing…" : "Sign & Save"}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleComplete}
            disabled={signing || !canComplete}
            className="gap-1.5"
          >
            <Check className="h-4 w-4" />
            {signing ? "Signing…" : "Complete Signing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
