import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ExecutorLeaseWireEnvelopeV1Schema,
  RuntimeWireEnvelopeV1Schema,
} from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const canonicalPath = resolve(
  root,
  "schemas/runtime/provider-neutral-runtime-v1.schema.json",
);
const embeddedPath = resolve(
  root,
  "packages/python/aillium_schemas/schemas/runtime/provider-neutral-runtime-v1.schema.json",
);

function convert(schema) {
  const definition = schema._def;
  switch (definition.typeName) {
    case "ZodEffects":
      return convert(definition.schema);
    case "ZodObject": {
      const shape = definition.shape();
      return {
        type: "object",
        additionalProperties: definition.unknownKeys !== "strict",
        required: Object.keys(shape),
        properties: Object.fromEntries(
          Object.entries(shape).map(([name, value]) => [name, convert(value)]),
        ),
      };
    }
    case "ZodString": {
      const result = { type: "string" };
      for (const check of definition.checks) {
        if (check.kind === "min") result.minLength = check.value;
        if (check.kind === "max") result.maxLength = check.value;
        if (check.kind === "regex") result.pattern = check.regex.source;
        if (check.kind === "datetime") result.format = "date-time";
        if (check.kind === "trim") result["x-zod-trim"] = true;
      }
      return result;
    }
    case "ZodNumber": {
      const result = { type: definition.checks.some((check) => check.kind === "int") ? "integer" : "number" };
      for (const check of definition.checks) {
        if (check.kind === "min") {
          result[check.inclusive ? "minimum" : "exclusiveMinimum"] = check.value;
        }
        if (check.kind === "max") {
          result[check.inclusive ? "maximum" : "exclusiveMaximum"] = check.value;
        }
      }
      return result;
    }
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodNull":
      return { type: "null" };
    case "ZodLiteral":
      return { const: definition.value };
    case "ZodEnum":
      return { enum: definition.values };
    case "ZodArray": {
      const result = { type: "array", items: convert(definition.type) };
      if (definition.minLength) result.minItems = definition.minLength.value;
      if (definition.maxLength) result.maxItems = definition.maxLength.value;
      return result;
    }
    case "ZodRecord":
      return { type: "object", additionalProperties: convert(definition.valueType) };
    case "ZodUnion":
      return { oneOf: definition.options.map(convert) };
    case "ZodDiscriminatedUnion":
      return { oneOf: [...definition.options.values()].map(convert) };
    case "ZodNullable":
      return { oneOf: [convert(definition.innerType), { type: "null" }] };
    case "ZodLazy":
    case "ZodUnknown":
      return {
        description: "JSON value constrained by the runtime byte/depth/node refinements",
      };
    default:
      throw new Error(`Unsupported Zod type in runtime schema: ${definition.typeName}`);
  }
}

const document = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.aillium.io/runtime/provider-neutral-runtime-v1.schema.json",
  title: "Aillium provider-neutral runtime v1 wire contracts",
  oneOf: [
    convert(RuntimeWireEnvelopeV1Schema),
    convert(ExecutorLeaseWireEnvelopeV1Schema),
  ],
  "x-aillium-runtime-refinements": [
    "payload execution identity, attempt, idempotency, and fencing must match context",
    "checkpoint executor and lease identity must match context",
    "model fallback targets and consumption must remain inside declared ceilings",
    "cancellation acknowledgement must complete within two seconds and forced stop within five seconds",
    "unknown side effects require reconciliation and are unsafe to replay",
    "runtime JSON is bounded by byte size, depth, and node count",
  ],
};
const rendered = `${JSON.stringify(document, null, 2)}\n`;

if (process.argv.includes("--check")) {
  assert.equal(readFileSync(canonicalPath, "utf8"), rendered, "canonical runtime JSON Schema is stale");
  assert.equal(readFileSync(embeddedPath, "utf8"), rendered, "Python runtime JSON Schema is stale");
  console.log("Runtime v1 generated JSON Schema is current in canonical and Python locations.");
} else {
  mkdirSync(dirname(canonicalPath), { recursive: true });
  mkdirSync(dirname(embeddedPath), { recursive: true });
  writeFileSync(canonicalPath, rendered);
  writeFileSync(embeddedPath, rendered);
  console.log("Generated runtime v1 JSON Schema in canonical and Python locations.");
}
