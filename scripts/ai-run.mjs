import dotenv from "dotenv";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import OpenAI from "openai";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DEFAULT_BUNDLE_PATH = ".ai/PROMPT_BUNDLE.md";
const DEFAULT_TASK_PATH = ".ai/TASK.md";
const PATCH_PATH = "patch.diff";
const PR_BODY_PATH = ".ai/PR_BODY.md";
const PR_BODY_EN_PATH = ".ai/PR_BODY.en.md";
const LAST_OUTPUT_PATH = ".ai/last-output.txt";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function readNumber(name, fallback) {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function rmIfExists(path) {
  try {
    await fs.rm(path, { force: true, recursive: false });
  } catch {
    // ignore
  }
}

async function cleanupArtifacts() {
  await rmIfExists(PATCH_PATH);
  await rmIfExists(PR_BODY_PATH);
  await rmIfExists(PR_BODY_EN_PATH);
  await rmIfExists(LAST_OUTPUT_PATH);
}

function extractCodeBlock(text, lang) {
  const re = new RegExp("```" + lang + "\\n([\\s\\S]*?)\\n```", "m");
  const m = text.match(re);
  return m ? m[1].trimEnd() : null;
}

function looksLikeUnifiedDiff(diff) {
  // 최소 요건: diff --git + --- + +++ + @@ (실제 hunk)
  const hasDiffGit = /^diff --git /m.test(diff);
  const hasMinus = /^--- /m.test(diff);
  const hasPlus = /^\+\+\+ /m.test(diff);
  const hasHunk = /^@@ /m.test(diff);
  return hasDiffGit && hasMinus && hasPlus && hasHunk;
}

function runCheck(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  return r.status === 0;
}

async function translatePrBodyToKorean({ client, model, text }) {
  const instructions = [
    "Translate the given GitHub pull request description into natural Korean.",
    "Keep the Markdown structure and headings as-is.",
    "Do not add new content. Do not remove content.",
    "Preserve code spans/backticks, command names, filenames, and paths exactly.",
    "If English technical terms are widely used (e.g., PR, lint, typecheck), you may keep them.",
  ].join("\n");

  const resp = await client.responses.create({
    model,
    instructions,
    input: text,
    temperature: 0.1,
    max_output_tokens: 1200,
    store: false,
  });

  const out = (resp.output_text ?? "").trimEnd();
  if (!out) return text; // 번역이 비면 원문 유지
  return out;
}

async function callAgent({
  client,
  model,
  temperature,
  maxOutputTokens,
  bundle,
  task,
  extraRules,
  attempt,
  previousOut,
}) {
  const diffTemplate = [
    "Here is a minimal valid example of a NEW FILE diff. Follow this format exactly:",
    "```diff",
    "diff --git a/src/domain/normalizeInput.ts b/src/domain/normalizeInput.ts",
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    "+++ b/src/domain/normalizeInput.ts",
    "@@ -0,0 +1,3 @@",
    "+export function normalizeInput(input: string): string {",
    "+  return input.trim();",
    "+}",
    "```",
    "",
    "Important: Your diff must include `---`, `+++`, and at least one `@@` hunk with real lines.",
    "Do NOT output header-only diffs like index ...e69de29.",
  ].join("\n");

  const baseRules = [
    "You are an agentic coding system that must produce a single-PR sized change.",
    "Return EXACTLY two blocks and nothing else:",
    "1) One unified diff inside a single ```diff code block.",
    "2) One PR body inside a single ```md code block (Summary / How to test / Risk & rollback / Notes).",
    "",
    "Hard requirements for the diff:",
    "- Must be valid `git diff` unified patch format: include `diff --git`, `---`, `+++`, and `@@` hunks.",
    "- Do NOT output header-only diffs. Every changed file must include at least one @@ hunk with real content.",
    "- If creating a new file, use `--- /dev/null` and `+++ b/<path>` and include at least one @@ hunk.",
    "- Hunk headers must match the exact number of lines that follow.",
    "- Every hunk line must start with ' ', '+', '-', or '\\\\' (no whitespace-only lines).",
    "",
    "Constraints:",
    "- Keep changes minimal; no large refactors, no mass formatting.",
    "- Do not add dependencies unless required by the task.",
    "- Changes must pass: pnpm test, pnpm lint, pnpm typecheck, pnpm format:check.",
    diffTemplate,
  ];

  const instructions = [...baseRules, ...(extraRules ? [extraRules] : [])].join(
    "\n",
  );

  const inputParts = [
    "# PROMPT_BUNDLE\n",
    bundle,
    "\n\n# TASK\n",
    task,
    "\n\n# ATTEMPT\n",
    String(attempt),
  ];

  if (previousOut) {
    inputParts.push(
      "\n\n# PREVIOUS_INVALID_OUTPUT (for debugging)\n",
      previousOut,
    );
  }

  const input = inputParts.join("");

  const response = await client.responses.create({
    model,
    instructions,
    input,
    temperature,
    max_output_tokens: maxOutputTokens,
    store: false,
  });

  const out = response.output_text ?? "";
  await fs.mkdir(".ai", { recursive: true });
  await fs.writeFile(LAST_OUTPUT_PATH, out, "utf8");

  const diff = extractCodeBlock(out, "diff");
  const prBody = extractCodeBlock(out, "md");

  if (!diff) throw new Error(`No diff block found. See ${LAST_OUTPUT_PATH}`);
  if (!prBody)
    throw new Error(`No md PR body block found. See ${LAST_OUTPUT_PATH}`);

  if (!looksLikeUnifiedDiff(diff)) {
    throw new Error(
      `Invalid unified diff (missing headers or @@ hunk). See ${LAST_OUTPUT_PATH}`,
    );
  }

  await fs.writeFile(PATCH_PATH, diff + "\n", "utf8");

  // Option 2) PR 본문을 마지막에 한국어로 번역하여 저장
  await fs.writeFile(PR_BODY_EN_PATH, prBody + "\n", "utf8");
  const koBody = await translatePrBodyToKorean({
    client,
    model,
    text: prBody,
  });
  await fs.writeFile(PR_BODY_PATH, koBody + "\n", "utf8");

  // 실제 적용 가능 여부까지 선검증
  const ok = runCheck("git", ["apply", "--check", "-p1", PATCH_PATH]);
  if (!ok) {
    throw new Error(
      `Generated patch is not applicable. See ${LAST_OUTPUT_PATH} and ${PATCH_PATH}`,
    );
  }
}

async function main() {
  const branch = process.argv[2] ?? "feat/ai-run";
  const commitMsg = process.argv[3] ?? "chore: apply ai patch";

  await cleanupArtifacts();

  console.log("[ai:run] bundling prompt...");
  const bundleRes = spawnSync("pnpm", ["ai:bundle"], { stdio: "inherit" });
  if (bundleRes.status !== 0) process.exit(bundleRes.status);

  if (!existsSync(DEFAULT_BUNDLE_PATH))
    throw new Error(`Bundle not found: ${DEFAULT_BUNDLE_PATH}`);
  if (!existsSync(DEFAULT_TASK_PATH))
    throw new Error(`Task file is required: ${DEFAULT_TASK_PATH}`);

  const bundle = await fs.readFile(DEFAULT_BUNDLE_PATH, "utf8");
  const task = (await fs.readFile(DEFAULT_TASK_PATH, "utf8")).trim();
  if (!task) throw new Error(`Task file is empty: ${DEFAULT_TASK_PATH}`);

  console.log("[ai:run] calling OpenAI...");
  const client = new OpenAI({ apiKey: mustEnv("OPENAI_API_KEY") });

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const maxOutputTokens = readNumber("OPENAI_MAX_OUTPUT_TOKENS", 2200);
  const temperature = readNumber("OPENAI_TEMPERATURE", 0.1);

  let previousOut = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const extraRules =
        attempt === 1
          ? ""
          : "Your previous output was invalid. Regenerate a correct unified diff with full headers and at least one @@ hunk per file. Do not output header-only diffs (e.g., index ...e69de29).";

      await cleanupArtifacts();
      await callAgent({
        client,
        model,
        temperature,
        maxOutputTokens,
        bundle,
        task,
        extraRules,
        attempt,
        previousOut,
      });
      break;
    } catch (e) {
      console.error(`[ai:run] attempt ${attempt} failed:`, e?.message || e);

      try {
        previousOut = await fs.readFile(LAST_OUTPUT_PATH, "utf8");
      } catch {
        previousOut = "";
      }

      if (attempt === 3) throw e;
    }
  }

  console.log(`[ai:run] wrote ${PATCH_PATH} and ${PR_BODY_PATH}`);
  console.log("[ai:run] applying patch + creating PR...");

  const prRes = spawnSync("node", ["scripts/ai-pr.mjs", branch, commitMsg], {
    stdio: "inherit",
    env: { ...process.env, AI_PR_BODY_FILE: PR_BODY_PATH },
  });

  process.exit(prRes.status ?? 1);
}

main().catch((e) => {
  console.error("[ai:run] failed:", e?.message || e);
  process.exit(1);
});
