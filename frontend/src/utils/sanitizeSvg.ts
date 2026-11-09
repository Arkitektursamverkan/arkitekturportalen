import DOMPurify from "dompurify";

/**
 * SVG markup from Arkitekten (via the platform) made safe to insert with
 * dangerouslySetInnerHTML.
 *
 * The scenes are drawn by another service, so their markup is not trusted:
 * scripts, event handlers, foreignObject and javascript: links are removed.
 * What the scenes need stays – shapes, text, markers, defs, gradients, filters
 * and <use> pointing at something in the same document (href="#…").
 *
 * The input is a fragment that goes INSIDE an <svg> (a <g> or <defs>), so it
 * is parsed inside one: parsed on its own, <path> would be an HTML element and
 * be dropped.
 */

const purify = DOMPurify(window);

// DOMPurify leaves <use> out of its SVG profile because it can fetch markup
// from elsewhere. It is let in here, but may only point inside the document.
purify.addHook("uponSanitizeAttribute", (node, data) => {
  if (
    node.nodeName.toLowerCase() === "use" &&
    (data.attrName === "href" || data.attrName === "xlink:href") &&
    !data.attrValue.trim().startsWith("#")
  ) {
    data.keepAttr = false;
  }
});

const SVG_NS = "http://www.w3.org/2000/svg";

// Panning and zooming re-render the scene; the same strings come back each time.
const cache = new Map<string, string>();
const CACHE_MAX = 2000;

export function sanitizeSvg(fragment: string | null | undefined): string {
  if (!fragment) return "";
  const hit = cache.get(fragment);
  if (hit !== undefined) return hit;

  const body = purify.sanitize(`<svg xmlns="${SVG_NS}">${fragment}</svg>`, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["use"],
    RETURN_DOM: true,
  });
  const svg = (body as Element).firstElementChild;
  const clean = svg && svg.namespaceURI === SVG_NS ? svg.innerHTML : "";

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(fragment, clean);
  return clean;
}
