export const MAX_IMAGES = 8;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export interface DraftImage { id: string; name: string; url?: string }

export function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(new Error("Invalid image"));
    reader.onerror = reader.onabort = () => reject(new Error("Image read failed"));
    reader.readAsDataURL(file);
  });
}

