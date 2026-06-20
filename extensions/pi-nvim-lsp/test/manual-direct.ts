import { getClientForFile, getActiveClients, shutdownAll } from "../src/pool.js";

async function main() {
  console.log("=== Testing with Lua file ===");
  const result = await getClientForFile(
    "/tmp/lsp-direct-test/test.lua",
    "/tmp/lsp-direct-test",
  );

  if (!result) {
    console.log("FAIL: No LSP client found for Lua file");
    console.log(
      "Check: ls ~/.local/share/kickstart/mason/bin/lua-language-server",
    );
    process.exit(1);
  }

  const { client, config } = result;
  console.log("Client:", config.command, "status:", client.status);

  await client.openFile("/tmp/lsp-direct-test/test.lua");
  console.log("File opened, waiting for diagnostics...");

  await new Promise((r) => setTimeout(r, 3000));

  const diags = client.getDiagnostics("/tmp/lsp-direct-test/test.lua");
  console.log("Diagnostics:", diags.length, "issues");
  for (const d of diags.slice(0, 3)) {
    console.log("  line", d.range.start.line + 1, ":", d.message?.substring(0, 80));
  }

  // Test hover
  try {
    const hover = await client.sendRequest(
      "textDocument/hover",
      {
        textDocument: { uri: "file:///tmp/lsp-direct-test/test.lua" },
        position: { line: 0, character: 6 },
      },
      5000,
    );
    console.log("Hover:", JSON.stringify(hover)?.substring(0, 100));
  } catch (e) {
    console.log("Hover failed:", (e as Error).message);
  }

  console.log("Active clients:", getActiveClients().length);
  await shutdownAll();
  console.log("Done");
}

main().catch(console.error);
