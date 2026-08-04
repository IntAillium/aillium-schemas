import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "aillium-schemas-consumer-"));
const cache = join(temporary, "npm-cache");

function npmPack(target) {
  const output = execFileSync(
    "npm",
    [
      "pack",
      "--ignore-scripts",
      "--json",
      "--cache",
      cache,
      "--pack-destination",
      temporary,
    ],
    { cwd: target, encoding: "utf8" },
  );
  const jsonStart = output.lastIndexOf("\n[");
  const result = JSON.parse(output.slice(jsonStart >= 0 ? jsonStart + 1 : 0));
  return join(temporary, result[0].filename);
}

try {
  const schemasTarball = npmPack(root);
  const zodTarball = npmPack(resolve(root, "node_modules/zod"));
  writeFileSync(
    join(temporary, "package.json"),
    `${JSON.stringify({ private: true }, null, 2)}\n`,
  );
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      cache,
      schemasTarball,
      zodTarball,
    ],
    { cwd: temporary, stdio: "pipe" },
  );
  const installedPackage = JSON.parse(
    readFileSync(
      join(temporary, "node_modules/@aillium/schemas/package.json"),
      "utf8",
    ),
  );
  assert.equal(installedPackage.dependencies.zod, "^3.23.8");

  writeFileSync(
    join(temporary, "consumer.mjs"),
    'import { RuntimeContractVersion, RuntimeWireEnvelopeV1Schema } from "@aillium/schemas";\n' +
      'if (RuntimeContractVersion !== "1.0" || !RuntimeWireEnvelopeV1Schema) process.exit(1);\n',
  );
  writeFileSync(
    join(temporary, "consumer.cjs"),
    'const { RuntimeContractVersion, RuntimeWireEnvelopeV1Schema } = require("@aillium/schemas");\n' +
      'if (RuntimeContractVersion !== "1.0" || !RuntimeWireEnvelopeV1Schema) process.exit(1);\n',
  );
  execFileSync(process.execPath, ["consumer.mjs"], { cwd: temporary, stdio: "pipe" });
  execFileSync(process.execPath, ["consumer.cjs"], { cwd: temporary, stdio: "pipe" });
  console.log("Packed root package installed zod and passed clean ESM and CommonJS consumers.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
