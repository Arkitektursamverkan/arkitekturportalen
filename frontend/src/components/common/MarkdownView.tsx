import React from "react";
import { Box, Link, Typography } from "@mui/material";

/**
 * Minimal Markdown renderer for text people write inside the app (uppdrag
 * document pages, discussion posts). Supports headings, bullet and numbered
 * lists, blockquotes, bold/italic/code and links — deliberately no HTML
 * passthrough: everything is built as React elements, so pasted markup is
 * shown as text rather than rendered.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("**")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      out.push(
        <Box
          key={key}
          component="code"
          sx={{ px: 0.5, borderRadius: 0.5, bgcolor: "action.hover", fontFamily: "monospace", fontSize: "0.9em" }}
        >
          {token.slice(1, -1)}
        </Box>,
      );
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const href = token.slice(token.indexOf("](") + 2, -1);
      out.push(
        <Link key={key} href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </Link>,
      );
    } else {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface Props {
  text: string;
  /** Rendered when the text is empty. */
  emptyText?: string;
}

const MarkdownView: React.FC<Props> = ({ text, emptyText }) => {
  const lines = (text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushList = () => {
    if (!listItems) return;
    const { ordered, items } = listItems;
    blocks.push(
      <Box
        key={`list-${blocks.length}`}
        component={ordered ? "ol" : "ul"}
        sx={{ pl: 3, my: 1, "& li": { mb: 0.5 } }}
      >
        {items.map((item, i) => (
          <li key={i}>
            <Typography variant="body2" component="span">
              {renderInline(item, `li-${blocks.length}-${i}`)}
            </Typography>
          </li>
        ))}
      </Box>,
    );
    listItems = null;
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const body = paragraph.join(" ");
    blocks.push(
      <Typography key={`p-${blocks.length}`} variant="body2" sx={{ my: 1, lineHeight: 1.7 }}>
        {renderInline(body, `p-${blocks.length}`)}
      </Typography>,
    );
    paragraph = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushAll();
      return;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      blocks.push(
        <Typography
          key={`h-${blocks.length}`}
          variant={(["h5", "h6", "subtitle1", "subtitle2"] as const)[level - 1]}
          sx={{ fontWeight: 700, mt: blocks.length ? 2 : 0, mb: 0.5 }}>
          {renderInline(heading[2], `h-${blocks.length}`)}
        </Typography>,
      );
      return;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushAll();
      blocks.push(
        <Box
          key={`q-${blocks.length}`}
          sx={{ borderLeft: 3, borderColor: "divider", pl: 1.5, my: 1, color: "text.secondary" }}
        >
          <Typography variant="body2">{renderInline(quote[1], `q-${blocks.length}`)}</Typography>
        </Box>,
      );
      return;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1];
      if (listItems && listItems.ordered !== ordered) flushList();
      listItems = listItems ?? { ordered, items: [] };
      listItems.items.push(item);
      return;
    }

    flushList();
    paragraph.push(line.trim());
  });
  flushAll();

  if (blocks.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {emptyText ?? "Inget innehåll ännu."}
      </Typography>
    );
  }
  return <Box>{blocks}</Box>;
};

export default MarkdownView;
