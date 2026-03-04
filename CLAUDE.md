# gg-coder

A TypeScript monorepo providing a unified LLM streaming API, an agentic loop system, and a CLI coding agent with OAuth authentication for Anthropic and OpenAI providers.

## Project Structure

```
packages/
  ├── gg-ai/                 # @gg/ai — Unified LLM streaming API
  │   └── src/
  │       ├── types.ts       # Core types (StreamOptions, ContentBlock, events)
  │       ├── errors.ts      # GGAIError, ProviderError
  │       ├── stream.ts      # Main stream() dispatch function
  │       ├── providers/     # Anthropic, OpenAI streaming implementations
  │       └── utils/         # EventStream, Zod-to-JSON-Schema
  │
  ├── gg-agent/              # @gg/agent — Agent loop with tool execution
  │   └── src/
  │       ├── types.ts       # AgentTool, AgentEvent, AgentOptions
  │       ├── agent.ts       # Agent class + AgentStream
  │       └── agent-loop.ts  # Pure async generator loop
  │
  └── gg-coding-agent/       # @gg/coding-agent — CLI (ggcoder)
      └── src/
          ├── cli.ts         # CLI entry point
          ├── core/          # Auth, OAuth, settings, sessions, extensions
          ├── tools/         # Agentic tools (bash, read, write, edit, grep, find)
          ├── ui/            # Ink/React terminal UI components & hooks
          ├── modes/         # Execution modes (interactive, print)
          └── utils/         # Error handling, git, shell, formatting
```

## Package Dependencies

`@gg/ai` (standalone) → `@gg/agent` (depends on ai) → `@gg/coding-agent` (depends on both)

## Tech Stack

- **Language**: TypeScript 5.9 (strict, ES2022, ESM)
- **Package Manager**: pnpm workspaces
- **Build**: tsc
- **Test**: Vitest 4.0
- **Lint**: ESLint 10 + typescript-eslint (flat config)
- **Format**: Prettier 3.8
- **CLI UI**: Ink 6 + React 19
- **Key deps**: `@anthropic-ai/sdk`, `openai`, `zod` (v4)

## Commands

```bash
# Build & typecheck all packages
pnpm build                          # tsc across all packages
pnpm check                          # tsc --noEmit across all packages

# Per-package
pnpm --filter @gg/ai build
pnpm --filter @gg/agent build
pnpm --filter @gg/coding-agent build
```

## Organization Rules

- Types → `types.ts` in each package
- Providers → `providers/` directory in @gg/ai
- Tools → `tools/` directory in @gg/coding-agent, one file per tool
- UI components → `ui/components/`, one component per file
- OAuth flows → `core/oauth/`, one file per provider
- Tests → co-located with source files

## Code Quality — Zero Tolerance

After editing ANY file, run:

```bash
pnpm check && pnpm lint && pnpm format:check
```

Fix ALL errors before continuing. Quick fixes:
- `pnpm lint:fix` — auto-fix ESLint issues
- `pnpm format` — auto-fix Prettier formatting
- Use `/fix` to run all checks and spawn parallel agents to fix issues

## Key Patterns

- **StreamResult/AgentStream**: dual-nature objects — async iterable (`for await`) + thenable (`await`)
- **EventStream**: push-based async iterable in `@gg/ai/utils/event-stream.ts`
- **agentLoop**: pure async generator — call LLM, yield deltas, execute tools, loop on tool_use
- **OAuth-only auth**: no API keys, PKCE OAuth flows, tokens in `~/.gg/auth.json`
- **Zod schemas**: tool parameters defined with Zod, converted to JSON Schema at provider boundary
