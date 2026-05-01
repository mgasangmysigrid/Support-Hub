import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

interface PdfInlineViewerProps {
  fileUrl: string;
  fileName: string;
}

export function PdfInlineViewer({ fileUrl, fileName }: PdfInlineViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="h-[70vh] overflow-auto rounded-md border bg-muted/20 p-3">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => {
            setNumPages(numPages);
            setLoadError(null);
          }}
          onLoadError={() => setLoadError("PDF preview is not available in this browser.")}
          loading={<p className="text-sm text-muted-foreground">Loading PDF…</p>}
        >
          <div className="space-y-3">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <Page
                key={pageNum}
                pageNumber={pageNum}
                width={900}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            ))}
          </div>
        </Document>
      </div>

      {loadError && (
        <p className="text-sm text-muted-foreground">
          {loadError}
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline ml-1">
            Open {fileName} in new tab
          </a>
        </p>
      )}
    </div>
  );
}
