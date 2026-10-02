// Usage: TS_NODE_PROJECT=scripts/tsconfig.json node -r ts-node/register/transpile-only
// -r tsconfig-paths/register scripts/audit-paddle-live-catalog.ts <metadata.json>
// Accept a non-sensitive array of Live prices with embedded product metadata.
// No environment files, credentials, network requests or mutations are performed.
import { readFileSync } from "node:fs";
import { validateLivePaddleCatalog } from "../lib/billing/paddle/validateLiveCatalog";
const path = process.argv[2];
if (!path) throw new Error("Supply a JSON file containing non-sensitive Live catalog metadata.");
const value: unknown = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(value)) throw new Error("Catalog metadata must be an array.");
const result = validateLivePaddleCatalog(value);
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.some(price => price.issues.length > 0) ? 1 : 0;
