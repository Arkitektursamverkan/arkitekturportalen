import { describe, expect, it } from "vitest";
import { isValidLinkUrl, linkAnchorProps } from "./sharedLinks";

describe("isValidLinkUrl", () => {
  it("takes web addresses and paths on the same server", () => {
    for (const url of ["https://intra.example.org/start", "http://example.org", "/rundvisning/", "/"]) {
      expect(isValidLinkUrl(url)).toBe(true);
    }
  });

  it("refuses scripts, data, other schemes and protocol-relative addresses", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "//evil.example.org", "ftp://example.org", "intra", "https://", "/med mellanslag"]) {
      expect(isValidLinkUrl(url)).toBe(false);
    }
  });
});

describe("linkAnchorProps", () => {
  it("opens a new tab without handing over the window", () => {
    expect(linkAnchorProps({ title: "X", url: "https://example.org", new_tab: true })).toEqual({
      href: "https://example.org", target: "_blank", rel: "noopener noreferrer",
    });
    expect(linkAnchorProps({ title: "X", url: "/rundvisning/" })).toEqual({ href: "/rundvisning/" });
  });
});
