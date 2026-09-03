import fs from "node:fs";
import path from "node:path";

/**
 * Reads a marked region out of a source file at render time.
 *
 * The alternative — pasting code into the page — guarantees the page will
 * eventually describe code that no longer exists. Markers are plain comments
 * (`#region <name>` / `#endregion`), so they cost the source nothing and are
 * understood by editors as folding hints.
 */
const cache = new Map<string, string>();

export function getSnippet(relativePath: string, region: string): string {
  const key = `${relativePath}#${region}`;
  if (process.env.NODE_ENV === "production") {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
  }

  let snippet = "";
  try {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
    const lines = source.split("\n");
    const start = lines.findIndex((l) => l.includes(`#region ${region}`));
    const end = start === -1 ? -1 : lines.findIndex((l, i) => i > start && l.includes("#endregion"));

    if (start !== -1 && end !== -1) {
      const body = lines.slice(start + 1, end);
      const widths = body.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length);
      const indent = widths.length ? Math.min(...widths) : 0;
      snippet = body.map((l) => l.slice(indent)).join("\n").trim();
    }
  } catch {
    // A missing file must not take the page down — the section simply omits
    // that snippet. This can happen if the app is run without its sources.
    snippet = "";
  }

  cache.set(key, snippet);
  return snippet;
}
