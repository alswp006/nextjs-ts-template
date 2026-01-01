import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(p) {
  const full = path.join(ROOT, p);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

const files = [
  ".ai/prompts/core/system.md",
  ".ai/prompts/core/planner.md",
  ".ai/prompts/core/implementer.md",
  ".ai/prompts/core/reviewer.md",
  ".ai/prompts/core/qa.md",
  ".ai/prompts/core/release.md",
  ".ai/project/overlay.md",
  ".ai/roles/00-overview.md",
  ".ai/config/commands.json",
  ".ai/config/budget.json",
  ".ai/TASK.md",
];

let out = `# AI Prompt Bundle (Single PR)\n\n`;
out += `## Output requirements\n`;
out += `- Return ONE unified diff inside a single \`\`\`diff code fence.\n`;
out += `- Also include PR body: Summary / How to test / Risk & rollback / Notes.\n\n`;

for (const f of files) {
  out += `---\n## FILE: ${f}\n\n`;
  out += "```md\n" + read(f).trim() + "\n```\n\n";
}

fs.writeFileSync(path.join(ROOT, ".ai/PROMPT_BUNDLE.md"), out);
console.log("Generated: .ai/PROMPT_BUNDLE.md");
