import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
// Reuse Next's image dependency; no new runtime dependency is needed.
const sharp = createRequire(require.resolve("next/package.json"))("sharp");
const sizes = [16, 24, 32, 48, 64, 128, 256];
for (const name of ["planner-open", "planner-stop"]) {
  const base = new URL(`../../assets/shortcuts/${name}`, import.meta.url);
  const svg = await readFile(new URL(`${base.href}.svg`));
  const images = await Promise.all(
    sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index] % 256;
    header[entry + 1] = sizes[index] % 256;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += image.length;
  });
  await writeFile(
    new URL(`${base.href}.ico`),
    Buffer.concat([header, ...images]),
  );
  await writeFile(new URL(`${base.href}.png`), images.at(-1));
  console.log(`${name}: ${sizes.length} icon sizes generated`);
}
