import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getProvider } from "./llm/index.js";
import { loadPolicyStore } from "./policy/store.js";
import { runPipeline } from "./pipeline.js";
import { renderTrace } from "./render.js";
import { ClaimSchema, type Claim } from "./schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SAMPLES_DIR = join(REPO_ROOT, "samples");
const POLICIES_DIR = join(REPO_ROOT, "policies");

/**
 * CLI:
 *   pnpm claim                       → runs the first sample
 *   pnpm claim samples/claim_001.json
 *   pnpm claim:all                   → runs every sample sequentially
 */
async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const explicitPath = args.find((a) => !a.startsWith("--"));

  const provider = getProvider();
  const policyStore = await loadPolicyStore(POLICIES_DIR);
  const runDir = process.env.RUN_DIR ?? ".runs";

  const claims = await loadClaims({ all, explicitPath });
  if (claims.length === 0) {
    console.error("No claims to process. Pass a path or put JSON files in samples/.");
    process.exit(1);
  }

  for (const claim of claims) {
    console.error(`\n▶ running ${claim.id} via provider "${provider.name}"`);
    const trace = await runPipeline(claim, { provider, policyStore, runDir });
    console.log(renderTrace(trace));
  }
}

async function loadClaims(opts: { all: boolean; explicitPath?: string }): Promise<Claim[]> {
  if (opts.explicitPath) {
    return [await readClaim(resolve(opts.explicitPath))];
  }

  const entries = (await readdir(SAMPLES_DIR))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => join(SAMPLES_DIR, f));

  if (entries.length === 0) return [];
  if (opts.all) return Promise.all(entries.map(readClaim));
  return [await readClaim(entries[0]!)];
}

async function readClaim(path: string): Promise<Claim> {
  const raw = await readFile(path, "utf8");
  return ClaimSchema.parse(JSON.parse(raw));
}

main().catch((err) => {
  console.error("\nclaims-agent failed:", err instanceof Error ? err.message : err);
  console.error(
    "\nIf using Ollama, check the server is up:  ollama serve\n" +
      "and the model is pulled:                   ollama pull qwen2.5:7b",
  );
  process.exit(1);
});
