import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Maps MIME media types to file extensions.
 */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
  "image/x-icon": ".ico",
};

/**
 * Sanitize a string for use in a filename by replacing characters
 * that are unsafe on common filesystems.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

/**
 * Build an ISO-like timestamp safe for filenames (colons replaced with dashes).
 */
function fileTimestamp(): string {
  const now = new Date();
  const iso = now.toISOString();
  const safe = iso.replace(/:/g, "-").replace(/\..+Z$/, "");
  return safe;
}

/**
 * Normalize an image content block to { data: Buffer; mediaType: string }.
 * Returns null if the block doesn't contain decodable image data.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractImage(
  block: Record<string, any>,
): { buffer: Buffer; mediaType: string } | null {
  const source = block.source as Record<string, unknown> | undefined;
  if (source?.type === "base64" && typeof source.data === "string") {
    return {
      buffer: Buffer.from(source.data, "base64"),
      mediaType: (typeof source.mediaType === "string" ? source.mediaType : "image/png"),
    };
  }

  if (typeof block.data === "string" && block.data.length > 0) {
    const mediaType = (typeof block.mimeType === "string" ? block.mimeType : "image/png");
    const raw = block.data;

    if (raw.startsWith("data:")) {
      const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
      if (match) {
        return { buffer: Buffer.from(match[2], "base64"), mediaType: match[1] };
      }
      return null;
    }

    try {
      return { buffer: Buffer.from(raw, "base64"), mediaType };
    } catch {
      return null;
    }
  }

  return null;
}

export const mcpImageSaver = (pi: ExtensionAPI): void => {
  pi.on("tool_result", async (event, ctx) => {
    const extracted: Array<{ buffer: Buffer; mediaType: string }> = [];
    for (const block of (event.content ?? [])) {
      if (block.type !== "image") continue;
      const img = extractImage(block);
      if (img) extracted.push(img);
    }

    if (extracted.length === 0) return;

    const imagesDir = join(ctx.cwd, ".pi", "images");
    const ts = fileTimestamp();

    await mkdir(imagesDir, { recursive: true });

    const savedPaths: string[] = [];

    for (let i = 0; i < extracted.length; i++) {
      const img = extracted[i];
      const ext = MIME_TO_EXT[img.mediaType] ?? ".png";
      const safeToolName = sanitizeFilename(event.toolName);

      const suffix = extracted.length > 1 ? `-${i + 1}` : "";
      const filename = `${safeToolName}-${ts}${suffix}${ext}`;
      const filepath = join(imagesDir, filename);

      await writeFile(filepath, img.buffer);
      savedPaths.push(filepath);
    }

    if (ctx.hasUI) {
      const msg =
        savedPaths.length === 1
          ? `📸 Image saved: ${savedPaths[0]}`
          : `📸 ${savedPaths.length} images saved to ${imagesDir}`;
      ctx.ui.notify(msg, "info");
    }

    console.log(
      `[mcp-image-saver] ${savedPaths.length} image(s) saved:`,
      savedPaths,
    );

    const summary =
      savedPaths.length === 1
        ? `Image saved to ${savedPaths[0]}`
        : `Images saved to:\n${savedPaths.map((p) => `- ${p}`).join("\n")}`;

    return {
      content: [...(event.content ?? []), { type: "text" as const, text: `\n${summary}` }],
    };
  });
};
