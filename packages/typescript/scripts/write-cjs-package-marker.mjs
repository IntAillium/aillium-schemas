import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../dist-cjs/", import.meta.url));
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  `${outputDirectory}/package.json`,
  `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`,
  "utf8",
);
