import fs from "node:fs/promises";
import path from "node:path";
import { formatSkillsForPrompt, type Skill } from "./core/skills.js";

const CONTEXT_FILES = ["AGENTS.md", "CLAUDE.md"];

/**
 * Build the system prompt dynamically based on cwd and context.
 */
export async function buildSystemPrompt(cwd: string, skills?: Skill[]): Promise<string> {
  const sections: string[] = [];

  // Role
  sections.push(
    `You are an expert coding assistant. You help users with software engineering tasks ` +
      `including writing code, debugging, refactoring, and explaining code. ` +
      `You have access to tools for reading, writing, and editing files, and running bash commands.`,
  );

  // Response style
  sections.push(
    `## Response Style\n\n` +
      `Keep responses short and to the point. After completing a task, respond with a brief summary in this structure:\n\n` +
      `1. **What was done** — A concise summary of the changes made (1-3 sentences max).\n` +
      `2. **What else was affected** — Only if relevant: side effects, related changes, or things to note.\n` +
      `3. **Recommended next steps** — Only if applicable: what the user might want to do next (e.g. run tests, review a file, consider a follow-up change).\n\n` +
      `Do NOT write long explanations, repeat back what the user asked, or pad responses with filler. ` +
      `Lead with the answer or action, not the reasoning. ` +
      `If you can say it in one sentence, do not use three. ` +
      `Skip sections that don't apply — not every response needs all three parts.\n\n` +
      `For pure questions (no code changes), answer directly and concisely.`,
  );

  // Tool guidelines
  sections.push(
    `## Tool Guidelines\n\n` +
      `- **read**: Always read a file before editing it. Use offset/limit for large files.\n` +
      `- **edit**: Use for surgical changes to existing files. The old_text must uniquely match one location.\n` +
      `- **write**: Use for creating new files or complete rewrites. Prefer edit for small changes.\n` +
      `- **bash**: Use for running commands, installing packages, running tests, git operations, etc. ` +
      `Avoid long-running or interactive commands.`,
  );

  // Project context — walk from cwd to root looking for context files
  const contextParts: string[] = [];
  let dir = cwd;
  const visited = new Set<string>();

  while (!visited.has(dir)) {
    visited.add(dir);
    for (const name of CONTEXT_FILES) {
      const filePath = path.join(dir, name);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const relPath = path.relative(cwd, filePath) || name;
        contextParts.push(`### ${relPath}\n\n${content.trim()}`);
      } catch {
        // File doesn't exist, skip
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (contextParts.length > 0) {
    sections.push(`## Project Context\n\n${contextParts.join("\n\n")}`);
  }

  // Skills
  if (skills && skills.length > 0) {
    const skillsSection = formatSkillsForPrompt(skills);
    if (skillsSection) {
      sections.push(skillsSection);
    }
  }

  // Metadata
  sections.push(
    `## Environment\n\n` +
      `- Current date: ${new Date().toISOString().split("T")[0]}\n` +
      `- Working directory: ${cwd}`,
  );

  return sections.join("\n\n");
}
