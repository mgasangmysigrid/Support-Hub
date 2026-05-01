const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const QUALITY_STEPS = [0.8, 0.6, 0.4, 0.3];
const MAX_DIMENSION_STEPS = [3840, 2560, 1920, 1280];

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.includes(file.type);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      type,
      quality
    );
  });
}

function drawScaled(
  img: HTMLImageElement,
  maxDim: number
): HTMLCanvasElement {
  let { naturalWidth: w, naturalHeight: h } = img;
  if (w > maxDim || h > maxDim) {
    const ratio = Math.min(maxDim / w, maxDim / h);
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

export interface OptimizeResult {
  file: File;
  wasOptimized: boolean;
  originalSize: number;
  finalSize: number;
}

/**
 * Optimizes an image file to be under 5 MB.
 * Non-image files are returned unchanged.
 * Throws if the image cannot be brought under the limit.
 */
export async function optimizeImageBeforeUpload(
  file: File
): Promise<OptimizeResult> {
  if (!isImageFile(file) || file.size <= MAX_SIZE) {
    return { file, wasOptimized: false, originalSize: file.size, finalSize: file.size };
  }

  const originalSize = file.size;
  // GIF: can't reliably re-encode, skip optimization
  if (file.type === "image/gif") {
    if (file.size > MAX_SIZE) {
      throw new Error("This GIF is too large (over 5 MB). Please use a smaller file.");
    }
    return { file, wasOptimized: false, originalSize, finalSize: file.size };
  }

  const img = await loadImage(file);
  // Use JPEG for opaque images (jpeg/webp), PNG for png (transparency)
  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const ext = outputType === "image/png" ? "png" : "jpg";

  // Try quality reduction at original size first, then with resize
  for (const maxDim of [Infinity, ...MAX_DIMENSION_STEPS]) {
    const canvas = drawScaled(img, maxDim === Infinity ? Math.max(img.naturalWidth, img.naturalHeight) : maxDim);

    const qualities = outputType === "image/png" ? [undefined] : QUALITY_STEPS;
    for (const q of qualities) {
      const blob = await canvasToBlob(canvas, outputType, q);
      if (blob.size <= MAX_SIZE) {
        const baseName = file.name.replace(/\.[^.]+$/, "");
        const optimizedFile = new File([blob], `${baseName}-optimized.${ext}`, {
          type: outputType,
        });
        console.log(
          `[image-optimizer] ${file.name}: ${(originalSize / 1024 / 1024).toFixed(1)}MB → ${(blob.size / 1024 / 1024).toFixed(1)}MB (q=${q ?? "default"}, maxDim=${maxDim === Infinity ? "original" : maxDim})`
        );
        URL.revokeObjectURL(img.src);
        return { file: optimizedFile, wasOptimized: true, originalSize, finalSize: blob.size };
      }
    }
  }

  URL.revokeObjectURL(img.src);
  throw new Error(
    "This image is still too large after optimization. Please try a smaller image."
  );
}
