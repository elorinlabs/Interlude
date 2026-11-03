// Vite emits local assets with hashes; factories retain PDF.js's original lookup names.
const assets = import.meta.glob<string>([
  '../../node_modules/pdfjs-dist/cmaps/*.bcmap',
  '../../node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}',
  '../../node_modules/pdfjs-dist/wasm/*.wasm',
], { eager: true, query: '?url&no-inline', import: 'default' });
const urls = new Map(Object.entries(assets).map(([path, url]) => [path.split('/').at(-1), url]));

async function readAsset(name: string) {
  const url = urls.get(name);
  if (!url) throw new Error('Missing PDF asset');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load PDF asset');
  return new Uint8Array(await response.arrayBuffer());
}

export class PdfCMapReader {
  async fetch({ name }: { name: string }) {
    return { cMapData: await readAsset(`${name}.bcmap`), isCompressed: true };
  }
}
export class PdfAssetReader {
  fetch({ filename }: { filename: string }) { return readAsset(filename); }
}
