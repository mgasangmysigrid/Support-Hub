import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Paperclip, Upload, FileText, Image, Trash2, Download, Loader2, FileSpreadsheet, FileArchive, Eye } from "lucide-react";
import { optimizeImageBeforeUpload } from "@/lib/image-optimizer";
import { AttachmentPreviewModal } from "@/components/AttachmentPreviewModal";

const ACCEPTED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".xls", ".xlsx", ".csv", ".zip"];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

interface TicketAttachmentsProps {
  ticketId: string;
  canUpload: boolean;
  canManage?: boolean;
}

export function TicketAttachments({ ticketId, canUpload, canManage = false }: TicketAttachmentsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewAtt, setPreviewAtt] = useState<{
    filePath: string;
    fileName: string;
    mimeType: string | null;
    uploaderName: string;
    uploadedAt: string;
  } | null>(null);

  const { data: attachments, isLoading } = useQuery({
    queryKey: ["ticket-attachments", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_attachments")
        .select("*, uploader:profiles!ticket_attachments_uploaded_by_fkey(full_name)")
        .eq("ticket_id", ticketId)
        .eq("is_inline", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !user) return;

    setUploading(true);
    try {
      for (let file of Array.from(files)) {
        const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
        if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(ext)) {
          toast.error(`${file.name}: Unsupported file type. Supported: PDF, Images, Excel, CSV, ZIP.`);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: File too large (max 20MB).`);
          continue;
        }

        // Auto-optimize large images
        if (file.type.startsWith("image/") && file.size > 5 * 1024 * 1024) {
          try {
            toast.info("Optimizing image for upload...");
            const result = await optimizeImageBeforeUpload(file);
            file = result.file;
          } catch (err: any) {
            toast.error(err.message || "Image optimization failed.");
            continue;
          }
        }

        const filePath = `${ticketId}/${crypto.randomUUID()}_${file.name}`;

        const { error: uploadError } = await supabase.storage
          .from("ticket-attachments")
          .upload(filePath, file);

        if (uploadError) {
          toast.error(`Failed to upload ${file.name}: ${uploadError.message}`);
          continue;
        }

        const { error: dbError } = await supabase.from("ticket_attachments").insert({
          ticket_id: ticketId,
          uploaded_by: user.id,
          file_name: file.name,
          file_path: filePath,
          mime_type: file.type,
        });

        if (dbError) {
          toast.error(`Failed to save ${file.name}: ${dbError.message}`);
          continue;
        }
      }
      toast.success("File(s) uploaded successfully");
      queryClient.invalidateQueries({ queryKey: ["ticket-attachments", ticketId] });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePreview = async (att: typeof attachments extends (infer T)[] | undefined ? T : never) => {
    if (!att) return;
    const { data, error } = await supabase.storage
      .from("ticket-attachments")
      .createSignedUrl(att.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Failed to generate preview URL");
      return;
    }
    setPreviewAtt({
      filePath: data.signedUrl,
      fileName: att.file_name,
      mimeType: att.mime_type,
      uploaderName: att.uploader?.full_name || "Unknown",
      uploadedAt: formatDistanceToNow(new Date(att.created_at!), { addSuffix: true }),
    });
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage
      .from("ticket-attachments")
      .download(filePath);

    if (error) {
      toast.error("Failed to download file");
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (attachmentId: string, filePath: string, fileName: string) => {
    const { error: storageError } = await supabase.storage
      .from("ticket-attachments")
      .remove([filePath]);

    if (storageError) {
      toast.error("Failed to delete file from storage");
      return;
    }

    const { error: dbError } = await supabase
      .from("ticket_attachments")
      .delete()
      .eq("id", attachmentId);

    if (dbError) {
      toast.error("Failed to delete file record");
      return;
    }

    // Log activity for attachment removal
    await supabase.from("ticket_activity").insert({
      ticket_id: ticketId,
      actor_id: user!.id,
      action: "attachment_removed",
      to_value: { file_name: fileName },
    });

    toast.success("File deleted");
    queryClient.invalidateQueries({ queryKey: ["ticket-attachments", ticketId] });
  };

  const getFileIcon = (mimeType: string | null, fileName?: string) => {
    if (mimeType?.startsWith("image/")) return <Image className="h-4 w-4 text-primary" />;
    if (mimeType?.includes("spreadsheet") || mimeType === "application/vnd.ms-excel" || mimeType === "text/csv" || fileName?.match(/\.(xlsx?|csv)$/i))
      return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
    if (mimeType?.includes("zip") || fileName?.endsWith(".zip"))
      return <FileArchive className="h-4 w-4 text-amber-600" />;
    return <FileText className="h-4 w-4 text-destructive" />;
  };

  return (
    <>
      <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Attachments
            {attachments?.length ? (
              <span className="text-xs text-muted-foreground font-normal">({attachments.length})</span>
            ) : null}
          </span>
          {canUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={[...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(",")}
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading..." : "Upload"}
              </Button>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : !attachments?.length ? (
          <p className="text-sm text-muted-foreground">No attachments yet.</p>
        ) : (
           <div className="space-y-2">
             {attachments.map((att) => (
               <div
                 key={att.id}
                 className="flex items-center justify-between rounded-lg border p-2.5 gap-3 hover:bg-muted/40 transition-colors cursor-pointer group"
                 onClick={() => handlePreview(att)}
               >
                 <div className="flex items-center gap-2 min-w-0 flex-1">
                   {getFileIcon(att.mime_type, att.file_name)}
                   <div className="min-w-0">
                     <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{att.file_name}</p>
                     <p className="text-xs text-muted-foreground">
                       {att.uploader?.full_name || "Unknown"} · {formatDistanceToNow(new Date(att.created_at!), { addSuffix: true })}
                     </p>
                   </div>
                 </div>
                 <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                   <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handlePreview(att)} title="Preview">
                     <Eye className="h-3.5 w-3.5" />
                   </Button>
                   <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDownload(att.file_path, att.file_name)} title="Download">
                     <Download className="h-3.5 w-3.5" />
                   </Button>
                   {(att.uploaded_by === user?.id || canManage) && (
                     <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(att.id, att.file_path, att.file_name)} title="Delete">
                       <Trash2 className="h-3.5 w-3.5" />
                     </Button>
                   )}
                 </div>
               </div>
             ))}
           </div>
         )}
       </CardContent>
     </Card>

     {previewAtt && (
       <AttachmentPreviewModal
         open={!!previewAtt}
         onOpenChange={(open) => !open && setPreviewAtt(null)}
         fileUrl={previewAtt.filePath}
         fileName={previewAtt.fileName}
         mimeType={previewAtt.mimeType}
         uploaderName={previewAtt.uploaderName}
         uploadedAt={previewAtt.uploadedAt}
         onDownload={() => {
           const a = document.createElement("a");
           a.href = previewAtt.filePath;
           a.download = previewAtt.fileName;
           a.target = "_blank";
           a.click();
         }}
       />
     )}
   </>
  );
}
