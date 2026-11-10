// @vitest-environment node
import { describe, expect, it } from "vitest";

// The web image serves public/licenses/ (see Dockerfile): the copy of NOTICE
// there must say what the repository's NOTICE says. (fs through a dynamic
// import: the app's tsconfig has no Node types.)
describe("licenses", () => {
  it("public/licenses/NOTICE.txt is the repository's NOTICE", async () => {
    const fsModule = "node:fs";
    const { readFileSync } = (await import(/* @vite-ignore */ fsModule)) as {
      readFileSync: (file: URL, encoding: "utf-8") => string;
    };
    const notice = readFileSync(new URL("../../NOTICE", import.meta.url), "utf-8");
    const copy = readFileSync(new URL("../public/licenses/NOTICE.txt", import.meta.url), "utf-8");
    expect(notice.length).toBeGreaterThan(100);
    expect(copy).toBe(notice);
  });
});
