/**
 * Regenerates transparent Arrexia app icons from public/brand/arrexia-icon-source.png
 * or the current public/brand/arrexia-icon.png (when re-running on an already-clean asset).
 *
 * Usage: node scripts/generate-app-icons.mjs
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import toIco from "to-ico";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "public/brand/arrexia-icon.png");

async function removeNearWhiteBackground(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= 248 && g >= 248 && b >= 248) {
      data[i + 3] = 0;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png();
}

async function prepareIconSource() {
  const transparent = await removeNearWhiteBackground(sourcePath);
  return sharp(await transparent.toBuffer()).trim().png().toBuffer();
}

async function renderSquareIcon(trimmed, size, fill = 0.9) {
  const inner = Math.max(1, Math.round(size * fill));
  const resized = await sharp(trimmed)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const padTop = Math.floor((size - (meta.height ?? size)) / 2);
  const padLeft = Math.floor((size - (meta.width ?? size)) / 2);
  const padBottom = size - (meta.height ?? size) - padTop;
  const padRight = size - (meta.width ?? size) - padLeft;

  return sharp(resized)
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

const trimmed = await prepareIconSource();
const icon512 = await renderSquareIcon(trimmed, 512, 0.88);
const apple180 = await renderSquareIcon(trimmed, 180, 0.9);
const faviconPngs = await Promise.all([16, 32, 48].map((size) => renderSquareIcon(trimmed, size, 0.94)));
const ico = await toIco(faviconPngs);

const outputs = {
  "app/icon.png": icon512,
  "app/apple-icon.png": apple180,
  "app/favicon.ico": ico,
  "public/favicon.ico": ico,
  "public/apple-touch-icon.png": apple180,
  "public/brand/arrexia-icon.png": icon512,
};

for (const [rel, buf] of Object.entries(outputs)) {
  await fs.writeFile(path.join(root, rel), buf);
  console.log(`Wrote ${rel} (${buf.length} bytes)`);
}
