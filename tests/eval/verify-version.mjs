// Verify installed language-mcp version + v0.8.x behavior via a fresh spawn of dist/cli.js.
// Usage: node tests/eval/verify-version.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const client = new Client({ name: "verify-version", version: "1.0.0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [path.join(repo, "dist", "cli.js")],
  cwd: "/tmp",
  stderr: "pipe",
}));
const version = client.getServerVersion()?.version ?? "unknown";
const tools = await client.listTools();
const res = await client.callTool({
  name: "check_dutch_b1_text",
  arguments: { text: "De werkgevers en de vakbond staken de onderhandelingen over een nieuw contract.", rare_word_zipf_max: 4.2 },
});
const body = res.content.map((c) => c.text ?? "").join("\n");
console.log(JSON.stringify({
  version,
  toolCount: tools.tools.length,
  synonymSuggestion: /try: ophouden, stoppen/.test(body),
}));
await client.close();
