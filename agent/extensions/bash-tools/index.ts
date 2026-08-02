/**
 * bash-tools: pi.dev extension
 *
 * Exposes modern CLI tools (bat, eza, ast-grep, jq, yq, sd, difft, gh,
 * tokei, zoxide) as LLM-callable tools and a /jump command.
 *
 * Note: find_files, fuzzy_filter, and search_code are intentionally absent.
 * Use bash with rg/find for plain identifier and file-name searches.
 *
 * Installed via brew. All tools called through pi.exec so they run in the
 * session's working directory with proper signal propagation.
 */

import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Type } from "@mariozechner/pi-ai";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  defineTool,
  formatSize,
  truncateHead,
  truncateTail,
  type ExtensionAPI,
  type TruncationResult,
  withFileMutationQueue,
} from "@mariozechner/pi-coding-agent";

// ── helpers ──────────────────────────────────────────────────────────────────

function ok(text: string, details?: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text }], details };
}

function fail(text: string): never {
  throw new Error(text);
}

type ExecResult = Awaited<ReturnType<ExtensionAPI["exec"]>>;

type ExecCliOptions = {
  cwd: string;
  signal?: AbortSignal;
  timeout: number;
  okCodes?: number[];
  transientRetries?: number;
};

type OutputMode = "head" | "tail";

type OutputDetails = {
  command?: string;
  truncation?: TruncationResult;
  fullOutputPath?: string;
};

function shellQuote(arg: string) {
  if (/^[A-Za-z0-9_/:=.,+@%-]+$/.test(arg)) return arg;
  return `'${arg.replaceAll("'", `'\''`)}'`;
}

function formatCommand(command: string, args: string[]) {
  return [command, ...args].map(shellQuote).join(" ");
}

function isTransientSpawnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(EBADF|EAGAIN|EMFILE|ENFILE)\b/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function execCli(
  pi: ExtensionAPI,
  command: string,
  args: string[],
  options: ExecCliOptions,
): Promise<ExecResult> {
  const okCodes = options.okCodes ?? [0];
  const transientRetries = options.transientRetries ?? 2;
  const formatted = formatCommand(command, args);

  for (let attempt = 0; attempt <= transientRetries; attempt += 1) {
    try {
      const result = await pi.exec(command, args, {
        cwd: options.cwd,
        signal: options.signal,
        timeout: options.timeout,
      });

      if (okCodes.includes(result.code)) return result;

      const output = (result.stderr || result.stdout || `${command} exited with code ${result.code}`).trim();
      throw new Error(`exit ${result.code}: ${output}`);
    } catch (error) {
      if (attempt < transientRetries && isTransientSpawnError(error)) {
        await sleep(100 * (attempt + 1));
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      fail(`${formatted} failed: ${message}`);
    }
  }

  fail(`${formatted} failed after retries`);
}

async function truncateOutput(
  output: string,
  options: { prefix: string; mode?: OutputMode },
): Promise<{ text: string; details: OutputDetails }> {
  const truncation = (options.mode ?? "head") === "tail"
    ? truncateTail(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES })
    : truncateHead(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });

  const details: OutputDetails = {};
  let text = truncation.content;

  if (truncation.truncated) {
    const tempDir = await mkdtemp(join(tmpdir(), `pi-${options.prefix}-`));
    const tempFile = join(tempDir, "output.txt");
    await withFileMutationQueue(tempFile, async () => {
      await writeFile(tempFile, output, "utf8");
    });

    details.truncation = truncation;
    details.fullOutputPath = tempFile;

    const omittedLines = truncation.totalLines - truncation.outputLines;
    const omittedBytes = truncation.totalBytes - truncation.outputBytes;
    text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
    text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    text += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
    text += ` Full output saved to: ${tempFile}]`;
  }

  return { text, details };
}

function isExistingPath(cwd: string, input: string) {
  return existsSync(resolve(cwd, input));
}

function looksLikeJsonInput(input: string) {
  return (
    input.startsWith("{") ||
    input.startsWith("[") ||
    input.startsWith('"') ||
    input === "true" ||
    input === "false" ||
    input === "null" ||
    /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(input)
  );
}

function looksLikeYamlOrTomlInput(input: string) {
  return (
    input.includes("\n") ||
    input.startsWith("{") ||
    input.startsWith("[") ||
    input.startsWith("-") ||
    input.startsWith("---") ||
    input.startsWith('"') ||
    /^[A-Za-z0-9_.-]+\s*:/.test(input) ||
    /^\[[^\]]+\]$/.test(input)
  );
}

function splitShellArgs(input: string) {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let tokenStarted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
        continue;
      }

      if (char === "\\") {
        i += 1;
        if (i >= input.length) throw new Error("unterminated escape sequence");
        current += input[i];
        tokenStarted = true;
        continue;
      }

      current += char;
      continue;
    }

    if (/\s/.test(char)) {
      if (tokenStarted) {
        args.push(current);
        current = "";
        tokenStarted = false;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      tokenStarted = true;
      continue;
    }

    if (char === "\\") {
      i += 1;
      if (i >= input.length) throw new Error("unterminated escape sequence");
      current += input[i];
      tokenStarted = true;
      continue;
    }

    current += char;
    tokenStarted = true;
  }

  if (quote) throw new Error("unterminated quoted string");
  if (tokenStarted) args.push(current);

  return args;
}

// ── tool factories (need pi.exec via closure) ─────────────────────────────────

function makeReadFileTool(pi: ExtensionAPI) {
  return defineTool({
    name: "read_file",
    label: "Read File (bat)",
    description:
      "Read a file using bat with plain output and line numbers. " +
      "Supports optional line ranges. Prefer this over the built-in read tool " +
      "when you want line numbers printed alongside content.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the file" }),
      start_line: Type.Optional(
        Type.Number({ description: "First line to read (1-indexed)" }),
      ),
      end_line: Type.Optional(
        Type.Number({ description: "Last line to read (1-indexed)" }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args = ["--plain", "--color=never", "--number"];
      if (params.start_line !== undefined || params.end_line !== undefined) {
        const start = params.start_line ?? 1;
        const end = params.end_line ?? "";
        args.push("--line-range", `${start}:${end}`);
      }
      args.push(params.path);

      const r = await execCli(pi, "bat", args, {
        cwd: ctx.cwd,
        signal,
        timeout: 10000,
      });
      const { text, details } = await truncateOutput(r.stdout, {
        prefix: "read-file",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeListDirTool(pi: ExtensionAPI) {
  return defineTool({
    name: "list_dir",
    label: "List Directory (eza)",
    description:
      "List directory contents using eza. Supports tree view, file metadata, and git status. " +
      "Use tree=true for recursive views; long=true for sizes and timestamps.",
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({ description: "Directory to list (defaults to cwd)" }),
      ),
      tree: Type.Optional(
        Type.Boolean({ description: "Show as a tree (default: false)" }),
      ),
      depth: Type.Optional(
        Type.Number({
          description: "Tree depth limit when tree=true (default: 3)",
        }),
      ),
      all: Type.Optional(Type.Boolean({ description: "Include hidden files" })),
      long: Type.Optional(
        Type.Boolean({ description: "Show size and modified time" }),
      ),
      git: Type.Optional(
        Type.Boolean({ description: "Show git status per entry" }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args = ["--color=never", "--icons=never"];
      if (params.tree) {
        args.push("--tree", "--level", String(params.depth ?? 3));
      }
      if (params.all) args.push("--all");
      if (params.long) args.push("--long", "--no-permissions", "--no-user");
      if (params.git) args.push("--git");
      if (params.path) args.push(params.path);

      const r = await execCli(pi, "eza", args, {
        cwd: ctx.cwd,
        signal,
        timeout: 10000,
      });
      const { text, details } = await truncateOutput(r.stdout, {
        prefix: "list-dir",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeAstSearchTool(pi: ExtensionAPI) {
  return defineTool({
    name: "ast_search",
    label: "AST Search (ast-grep)",
    description:
      "Search code using structural AST patterns with ast-grep (sg). " +
      "Output is truncated to 2000 lines or 50KB. " +
      "Use for syntax-shaped queries, not bare identifiers/properties (use bash with rg for those). " +
      "Metavariables: $VAR matches a single AST node, $$$VAR matches zero or more nodes. " +
      "Example patterns: 'console.log($MSG)', 'async function $F($$$) { $$$BODY }', " +
      "'if ($COND) { $$$ }'. Lang is auto-detected from file extensions if omitted.",
    promptSnippet:
      "Search source code by structural AST pattern using ast-grep; use bash with rg for bare identifiers.",
    promptGuidelines: [
      "Use ast_search only for structural code patterns such as function calls, declarations, conditionals, JSX elements, or imports.",
      "Do not use ast_search for bare identifiers, object property names, string constants, or file names; use bash with rg/find first.",
    ],
    parameters: Type.Object({
      pattern: Type.String({
        description: "AST pattern with optional $VAR / $$$VAR metavariables",
      }),
      path: Type.Optional(
        Type.String({
          description: "File or directory to search (defaults to cwd)",
        }),
      ),
      lang: Type.Optional(
        Type.String({
          description:
            "Language override: ts, tsx, js, jsx, py, rs, go, java, c, cpp, etc.",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args = ["run", "--pattern", params.pattern, "--color=never"];
      if (params.lang) args.push("--lang", params.lang);
      if (params.path) args.push(params.path);

      const r = await execCli(pi, "sg", args, {
        cwd: ctx.cwd,
        signal,
        timeout: 15000,
        okCodes: [0, 1],
      });
      const output = r.stdout || "(no matches)";
      const { text, details } = await truncateOutput(output, {
        prefix: "ast-search",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeJsonQueryTool(pi: ExtensionAPI) {
  return defineTool({
    name: "json_query",
    label: "JSON Query (jq)",
    description:
      "Query and transform JSON using jq. " +
      "Pass a file path or a raw JSON string as input. " +
      "Examples: '.name', '.items[] | .id', '{n: .name, count: (.items | length)}'.",
    parameters: Type.Object({
      query: Type.String({ description: "jq filter expression" }),
      input: Type.String({ description: "JSON string or file path" }),
      raw_output: Type.Optional(
        Type.Boolean({ description: "Output raw strings (jq -r)" }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const jqArgs: string[] = [];
      if (params.raw_output) jqArgs.push("--raw-output");
      jqArgs.push(params.query);

      const trimmed = params.input.trim();
      const shouldTreatAsInline =
        looksLikeJsonInput(trimmed) && !isExistingPath(ctx.cwd, trimmed);

      let r;
      if (shouldTreatAsInline) {
        r = await execCli(
          pi,
          "sh",
          [
            "-c",
            'input="$1"; shift; printf "%s" "$input" | jq "$@"',
            "--",
            trimmed,
            ...jqArgs,
          ],
          { cwd: ctx.cwd, signal, timeout: 10000 },
        );
      } else {
        r = await execCli(pi, "jq", [...jqArgs, trimmed], {
          cwd: ctx.cwd,
          signal,
          timeout: 10000,
        });
      }

      if (r.code !== 0) fail(r.stderr || "jq exited with error");
      const { text, details } = await truncateOutput(r.stdout, {
        prefix: "json-query",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeYamlQueryTool(pi: ExtensionAPI) {
  return defineTool({
    name: "yaml_query",
    label: "YAML/TOML Query (yq)",
    description:
      "Query and transform YAML, TOML, or JSON files using yq. " +
      "Uses the same filter syntax as jq. Pass a file path or raw YAML/TOML string. " +
      "Examples: '.name', '.services.web.image', '.dependencies | keys'.",
    parameters: Type.Object({
      query: Type.String({ description: "yq filter expression" }),
      input: Type.String({ description: "YAML/TOML/JSON string or file path" }),
      output_format: Type.Optional(
        Type.String({
          description: "Output format: yaml (default), json, toml, props",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const yqArgs = ["--no-colors"];
      if (params.output_format)
        yqArgs.push("--output-format", params.output_format);
      yqArgs.push(params.query);

      const trimmed = params.input.trim();
      const shouldTreatAsInline =
        looksLikeYamlOrTomlInput(trimmed) && !isExistingPath(ctx.cwd, trimmed);

      let r;
      if (shouldTreatAsInline) {
        r = await execCli(
          pi,
          "sh",
          [
            "-c",
            'input="$1"; shift; printf "%s" "$input" | yq "$@"',
            "--",
            trimmed,
            ...yqArgs,
          ],
          { cwd: ctx.cwd, signal, timeout: 10000 },
        );
      } else {
        r = await execCli(pi, "yq", [...yqArgs, trimmed], {
          cwd: ctx.cwd,
          signal,
          timeout: 10000,
        });
      }

      if (r.code !== 0) fail(r.stderr || "yq exited with error");
      const { text, details } = await truncateOutput(r.stdout, {
        prefix: "yaml-query",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeDiffTool(pi: ExtensionAPI) {
  return defineTool({
    name: "diff_files",
    label: "Structural Diff (difft)",
    description:
      "Compare two files using difftastic (difft), which diffs by syntax tree rather than " +
      "raw text. Ignores formatting noise and shows only semantic changes. " +
      "Ideal for reviewing what actually changed before deciding what to edit. " +
      "Use instead of standard diff when working with source code.",
    parameters: Type.Object({
      path_a: Type.String({ description: "First file path" }),
      path_b: Type.String({ description: "Second file path" }),
      lang: Type.Optional(
        Type.String({
          description:
            "Language override: ts, js, py, rs, go, etc. (auto-detected if omitted)",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args = ["--color=never"];
      if (params.lang) args.push("--language", params.lang);
      args.push(params.path_a, params.path_b);

      const r = await execCli(pi, "difft", args, {
        cwd: ctx.cwd,
        signal,
        timeout: 15000,
        okCodes: [0, 1],
      });
      const { text, details } = await truncateOutput(r.stdout || "(no differences)", {
        prefix: "diff-files",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeGhTool(pi: ExtensionAPI) {
  return defineTool({
    name: "gh",
    label: "GitHub CLI (gh)",
    description:
      "Run GitHub CLI commands for repo operations: PRs, issues, CI status, releases, and more. " +
      "Pass any valid gh subcommand and arguments as a single args string. " +
      "Examples: 'pr list', 'pr view 42', 'issue create --title \"Bug\" --body \"desc\"', " +
      "'run list', 'run view 12345', 'release list'.",
    parameters: Type.Object({
      args: Type.String({
        description: "gh subcommand and arguments, e.g. 'pr list --state open'",
      }),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      let ghArgs: string[];

      try {
        ghArgs = splitShellArgs(params.args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fail(`invalid gh args: ${message}`);
      }

      if (ghArgs.length === 0) {
        return fail("gh args must not be empty");
      }

      const r = await execCli(pi, "gh", ghArgs, {
        cwd: ctx.cwd,
        signal,
        timeout: 30000,
      });
      const { text, details } = await truncateOutput(r.stdout, {
        prefix: "gh",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeSdTool(pi: ExtensionAPI) {
  return defineTool({
    name: "find_replace",
    label: "Find and Replace (sd)",
    description:
      "Find and replace text in files using sd, a modern sed replacement. " +
      "Supports regex or literal patterns. Safer to construct than sed — no escaping pitfalls. " +
      "Edits files in place. Use ast_search to locate sites first, then this to apply changes.",
    parameters: Type.Object({
      find: Type.String({ description: "Pattern to find (regex by default)" }),
      replace: Type.String({
        description: "Replacement string. Use $1, $2 for capture groups.",
      }),
      path: Type.String({ description: "File path to edit in place" }),
      literal: Type.Optional(
        Type.Boolean({
          description: "Treat find as a literal string, not regex",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args: string[] = [];
      if (params.literal) args.push("--string-mode");
      args.push(params.find, params.replace, params.path);

      const r = await execCli(pi, "sd", args, {
        cwd: ctx.cwd,
        signal,
        timeout: 10000,
      });
      const { text, details } = await truncateOutput(r.stdout || "(done)", {
        prefix: "find-replace",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

function makeTokeiTool(pi: ExtensionAPI) {
  return defineTool({
    name: "codebase_stats",
    label: "Codebase Stats (tokei)",
    description:
      "Count lines of code by language using tokei. Fast codebase orientation tool — " +
      "shows language breakdown, file counts, code vs comment vs blank lines. " +
      "Run at the start of a session to understand what a repo is made of.",
    parameters: Type.Object({
      path: Type.Optional(
        Type.String({ description: "Directory to analyse (defaults to cwd)" }),
      ),
      sort: Type.Optional(
        Type.String({
          description:
            "Sort by: lines (default), code, comments, blanks, files",
        }),
      ),
    }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const args: string[] = [];
      if (params.sort) args.push("--sort", params.sort);
      if (params.path) args.push(params.path);

      const r = await execCli(pi, "tokei", args, {
        cwd: ctx.cwd,
        signal,
        timeout: 15000,
      });
      const { text, details } = await truncateOutput(r.stdout, {
        prefix: "codebase-stats",
        mode: "head",
      });
      return ok(text, details);
    },
  });
}

// ── /jump command ─────────────────────────────────────────────────────────────

function registerJumpCommand(pi: ExtensionAPI) {
  pi.registerCommand("jump", {
    description:
      "Jump to a directory using zoxide smart matching. Usage: /jump <query>",
    handler: async (args, ctx) => {
      const query = args.trim();
      if (!query) {
        await ctx.ui.notify("Usage: /jump <directory query>");
        return;
      }
      const r = await pi.exec("zoxide", ["query", query], { cwd: ctx.cwd });
      if (r.code !== 0 || !r.stdout.trim()) {
        await ctx.ui.notify(`zoxide: no match for "${query}"`);
        return;
      }
      const target = r.stdout.trim();
      ctx.cwd = target;
      await ctx.ui.notify(`Jumped to: ${target}`);
    },
  });
}

// ── extension entry point ─────────────────────────────────────────────────────

export default function bashToolsExtension(pi: ExtensionAPI) {
  pi.registerTool(makeReadFileTool(pi));
  pi.registerTool(makeListDirTool(pi));
  pi.registerTool(makeAstSearchTool(pi));
  pi.registerTool(makeJsonQueryTool(pi));
  pi.registerTool(makeYamlQueryTool(pi));
  pi.registerTool(makeDiffTool(pi));
  pi.registerTool(makeGhTool(pi));
  pi.registerTool(makeSdTool(pi));
  pi.registerTool(makeTokeiTool(pi));
  registerJumpCommand(pi);
}
