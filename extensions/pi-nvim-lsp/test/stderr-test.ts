import { getClientForFile, shutdownAll } from "../src/pool.js";
import { getLogEntries } from "../src/logger.js";

async function main() {
  const r = await getClientForFile("/tmp/lsp-stderr-test/test.lua", "/tmp/lsp-stderr-test");
  if (r) {
    await r.client.openFile("/tmp/lsp-stderr-test/test.lua");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await shutdownAll();
  }

  const entries = getLogEntries(30);
  console.log("=== Log entries ===");
  for (const e of entries) {
    const t = new Date(e.timestamp).toISOString().slice(11, 23);
    const dir = e.direction === "stderr" ? "STDERR" : e.direction === "send" ? "SEND" : "RECV";
    console.log(`${t} ${dir.padEnd(6)} ${e.client.padEnd(20)} ${e.summary?.slice(0, 80) ?? ""}`);
  }
}

main().catch(console.error);
