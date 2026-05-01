import { PDFDocument, rgb } from "pdf-lib";
import { format } from "date-fns";

/**
 * Generate a signed PDF by embedding signature images at field coordinates.
 * Preserves original signature aspect ratio for natural appearance.
 */
export async function generateSignedPdf(
  pdfUrl: string,
  fields: any[],
  signatures: any[],
  signers: any[]
): Promise<Uint8Array> {
  const pdfResponse = await fetch(pdfUrl);
  const pdfArrayBuffer = await pdfResponse.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfArrayBuffer);

  // Build a map: signer_user_id → { signature_data, signer_name, signed_at }
  const sigMap = new Map<string, { sigData: string; name: string; signedAt: string | null }>();
  for (const sig of signatures) {
    const signerInfo = signers.find((s: any) => s.signer_user_id === sig.signer_user_id);
    sigMap.set(sig.signer_user_id, {
      sigData: sig.signature_data,
      name: sig.signer?.full_name || signerInfo?.signer?.full_name || "Signer",
      signedAt: signerInfo?.signed_at || sig.signed_at || null,
    });
  }

  const pages = pdfDoc.getPages();

  for (const field of fields) {
    if (!field.completed) continue;
    const sigInfo = sigMap.get(field.signer_user_id);
    if (!sigInfo) continue;

    const pageIndex = (field.page_number || 1) - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) continue;
    const page = pages[pageIndex];

    const pageHeight = page.getHeight();

    const x = Number(field.x_position) || 0;
    const fieldHeight = Number(field.height) || 60;
    const fieldWidth = Number(field.width) || 200;
    // PDF origin is bottom-left; fields use top-left
    const y = pageHeight - (Number(field.y_position) || 0) - fieldHeight;

    if (field.field_type === "signature" && sigInfo.sigData) {
      try {
        // Embed the signature image
        let sigImage;
        if (sigInfo.sigData.startsWith("data:image/png")) {
          const base64 = sigInfo.sigData.split(",")[1];
          const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          sigImage = await pdfDoc.embedPng(sigBytes);
        } else if (sigInfo.sigData.startsWith("data:image/jpeg") || sigInfo.sigData.startsWith("data:image/jpg")) {
          const base64 = sigInfo.sigData.split(",")[1];
          const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          sigImage = await pdfDoc.embedJpg(sigBytes);
        } else {
          const base64 = sigInfo.sigData.split(",")[1] || sigInfo.sigData;
          const sigBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          sigImage = await pdfDoc.embedPng(sigBytes);
        }

        // Reserve bottom 30% for name/date text, top 70% for signature
        const sigAreaHeight = fieldHeight * 0.7;
        const sigAreaWidth = fieldWidth;

        // Proportional scaling - preserve aspect ratio
        const intrinsicWidth = sigImage.width;
        const intrinsicHeight = sigImage.height;
        const scale = Math.min(sigAreaWidth / intrinsicWidth, sigAreaHeight / intrinsicHeight);
        const renderWidth = intrinsicWidth * scale;
        const renderHeight = intrinsicHeight * scale;

        // Center within the signature area
        const sigX = x + (sigAreaWidth - renderWidth) / 2;
        const sigY = y + fieldHeight - renderHeight - (sigAreaHeight - renderHeight) / 2;

        page.drawImage(sigImage, {
          x: sigX,
          y: sigY,
          width: renderWidth,
          height: renderHeight,
        });

        // Draw signer name and date below signature
        const fontSize = Math.min(8, fieldHeight * 0.12);
        const nameText = sigInfo.name;
        const dateText = sigInfo.signedAt
          ? `Signed on ${format(new Date(sigInfo.signedAt), "MMM d, yyyy")}`
          : `Signed on ${format(new Date(), "MMM d, yyyy")}`;

        page.drawText(nameText, {
          x: x + 2,
          y: y + fieldHeight * 0.2,
          size: fontSize,
          color: rgb(0.15, 0.15, 0.15),
        });

        page.drawText(dateText, {
          x: x + 2,
          y: y + fieldHeight * 0.06,
          size: fontSize * 0.85,
          color: rgb(0.4, 0.4, 0.4),
        });
      } catch (err) {
        console.error("Failed to embed signature for field:", field.id, err);
      }
    }
  }

  return pdfDoc.save();
}
