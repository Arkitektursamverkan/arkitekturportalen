import { describe, expect, it } from "vitest";
import { sanitizeSvg } from "./sanitizeSvg";

/** Parse the result the way the browser does when it is put inside an <svg>. */
function inSvg(markup: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.innerHTML = markup;
  return svg;
}

describe("sanitizeSvg", () => {
  it("removes scripts, event handlers and foreignObject", () => {
    const out = sanitizeSvg(
      '<image href="x" onerror="alert(1)"/>' +
        "<script>alert(2)</script>" +
        '<foreignObject><div onclick="alert(3)">x</div></foreignObject>' +
        '<a href="javascript:alert(4)"><text>t</text></a>' +
        '<rect width="5" height="5" onload="alert(5)"/>',
    );
    expect(out).not.toMatch(/onerror|onload|onclick|alert|<script|foreignObject|javascript:/i);
  });

  it("keeps markers, defs, gradients, text and internal <use>", () => {
    const defs = sanitizeSvg(
      '<marker id="c8-arrow-seq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">' +
        '<path d="M0,0 L10,5 L0,10 z" fill="#374151"/></marker>' +
        '<linearGradient id="g1"><stop offset="0" stop-color="#fff"/></linearGradient>' +
        '<symbol id="s1"><circle r="3"/></symbol>',
    );
    const d = inSvg(defs);
    expect(d.querySelector("marker#c8-arrow-seq path")?.getAttribute("d")).toBe("M0,0 L10,5 L0,10 z");
    expect(d.querySelector("linearGradient#g1 stop")).not.toBeNull();

    const node = inSvg(
      sanitizeSvg(
        '<rect x="0" y="0" width="120" height="60" rx="8" fill="url(#g1)" stroke="#333"/>' +
          '<text x="60" y="30" text-anchor="middle" font-size="12">Godkänn <tspan>faktura</tspan></text>' +
          '<use href="#s1" x="4" y="4"/>' +
          '<use href="https://evil.example/x.svg#a"/>',
      ),
    );
    expect(node.querySelector("rect")?.getAttribute("fill")).toBe("url(#g1)");
    expect(node.querySelector("text")?.textContent).toBe("Godkänn faktura");
    const uses = node.querySelectorAll("use");
    expect(uses[0].getAttribute("href")).toBe("#s1");
    expect(uses[1]?.getAttribute("href") ?? null).toBeNull();
  });

  it("returns an empty string for nothing", () => {
    expect(sanitizeSvg("")).toBe("");
    expect(sanitizeSvg(undefined)).toBe("");
  });
});
