import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

export type DecodeRequest = {
  width: number;
  height: number;
  buffer: ArrayBuffer;
};

export type DecodeResponse =
  | { type: "ready" }
  | { type: "result"; text: string | null }
  | { type: "fatal"; message: string };

// tsconfig "dom" lib'i ile derlendiği için worker scope'unu elle tanımlıyoruz
const ctx = self as unknown as {
  location: Location;
  postMessage: (message: DecodeResponse) => void;
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
};

// .wasm dosyası CDN yerine kendi origin'imizden yüklenir
const ready = prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm")
        ? `${ctx.location.origin}/zxing/${path}`
        : prefix + path,
  },
  fireImmediately: true,
});

ready.then(
  () => ctx.postMessage({ type: "ready" }),
  (err) => ctx.postMessage({ type: "fatal", message: String(err) }),
);

ctx.onmessage = async (event) => {
  const { width, height, buffer } = event.data;
  try {
    await ready;
    const image = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const results = await readBarcodes(image, {
      formats: ["QRCode"],
      tryHarder: true,
      tryRotate: false,
      tryInvert: false,
      tryDownscale: true,
      maxNumberOfSymbols: 1,
    });
    ctx.postMessage({ type: "result", text: results[0]?.text || null });
  } catch {
    // Tek bir karenin çözülememesi taramayı durdurmamalı
    ctx.postMessage({ type: "result", text: null });
  }
};
