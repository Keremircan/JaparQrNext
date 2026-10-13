// zxing-wasm varsayılan olarak .wasm dosyasını jsDelivr CDN'inden çeker.
// Fabrika ağında dış erişime bağımlı kalmamak için dosyayı public/ altına
// kopyalayıp kendi origin'imizden sunuyoruz (bkz. lib/scanner/decoder.worker.ts).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm");
const target = join(root, "public/zxing/zxing_reader.wasm");

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("zxing_reader.wasm -> public/zxing/");
