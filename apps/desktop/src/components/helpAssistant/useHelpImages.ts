import { useEffect, useRef, useState } from 'react';
import { IMAGE_TYPES, readImage } from '../../pages/codexGui/draftImages';

export const MAX_HELP_IMAGES = 4;
export const MAX_HELP_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_HELP_TOTAL_IMAGE_BYTES = MAX_HELP_IMAGES * MAX_HELP_IMAGE_BYTES;
export type HelpImageError = 'imageType' | 'imageSize' | 'imageCount' | 'imageRead';

export function imageBytes(images: string[]) {
  return images.reduce((total, image) => {
    const data = image.slice(image.indexOf(',') + 1);
    return total + data.length * 3 / 4 - (data.endsWith('==') ? 2 : Number(data.endsWith('=')));
  }, 0);
}

export function useHelpImages() {
  const [images, setImages] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<HelpImageError>();
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => () => { generation.current++; }, []);

  const add = async (files: File[]) => {
    if (busy.current || !files.length) return;
    if (files.some((file) => !IMAGE_TYPES.includes(file.type))) { setError('imageType'); return; }
    if (files.some((file) => !file.size || file.size > MAX_HELP_IMAGE_BYTES)) { setError('imageSize'); return; }
    if (files.length + images.length > MAX_HELP_IMAGES) { setError('imageCount'); return; }
    const current = generation.current;
    busy.current = true; setReading(true); setError(undefined);
    try {
      const additions = await Promise.all(files.map(readImage));
      if (current === generation.current) setImages((previous) => [...previous, ...additions]);
    } catch {
      if (current === generation.current) setError('imageRead');
    } finally {
      busy.current = false;
      if (current === generation.current) setReading(false);
    }
  };
  const clear = () => { generation.current++; setImages([]); setError(undefined); setReading(false); };
  const remove = (index: number) => {
    setImages((previous) => previous.filter((_, position) => position !== index)); setError(undefined);
  };
  return { images, setImages, reading, error, add, remove, clear };
}
