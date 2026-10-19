import React, { useCallback, useEffect, useRef, useState } from "react";
import { Box, Divider, IconButton, Paper, Stack, TextField, ToggleButton, Tooltip } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import TitleIcon from "@mui/icons-material/Title";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import CodeIcon from "@mui/icons-material/Code";
import LinkIcon from "@mui/icons-material/Link";
import VisibilityIcon from "@mui/icons-material/Visibility";
import MarkdownView from "./MarkdownView";

/**
 * Textarea with formatting buttons over the Markdown that MarkdownView
 * renders. The buttons work on the current selection — nobody should have to
 * know the syntax to write a bullet list or bold a word.
 */

interface Props {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
  autoFocus?: boolean;
}

/** Where the caret should end up after a toolbar action. */
interface Selection {
  start: number;
  end: number;
}

const MarkdownEditor: React.FC<Props> = ({
  value,
  onChange,
  label,
  placeholder,
  minRows = 10,
  autoFocus,
}) => {
  const areaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingRef = useRef<Selection | null>(null);
  const [preview, setPreview] = useState(false);

  // Toolbar actions replace the whole value, so the caret has to be put back
  // by hand once React has re-rendered with the new text.
  useEffect(() => {
    const pending = pendingRef.current;
    const area = areaRef.current;
    if (!pending || !area) return;
    pendingRef.current = null;
    area.focus();
    area.setSelectionRange(pending.start, pending.end);
  }, [value]);

  const apply = useCallback(
    (next: string, selection: Selection) => {
      pendingRef.current = selection;
      onChange(next);
    },
    [onChange],
  );

  const wrap = useCallback(
    (marker: string, fallback: string) => {
      const area = areaRef.current;
      if (!area) return;
      const { selectionStart: start, selectionEnd: end } = area;
      const selected = value.slice(start, end);
      const inner = selected || fallback;
      const before = value.slice(0, start);
      const after = value.slice(end);

      // Clicking the same button again unwraps what it wrapped.
      if (before.endsWith(marker) && after.startsWith(marker)) {
        apply(before.slice(0, -marker.length) + selected + after.slice(marker.length), {
          start: start - marker.length,
          end: end - marker.length,
        });
        return;
      }
      apply(`${before}${marker}${inner}${marker}${after}`, {
        start: start + marker.length,
        end: start + marker.length + inner.length,
      });
    },
    [apply, value],
  );

  const prefixLines = useCallback(
    (prefixFor: (index: number) => string, matcher: RegExp) => {
      const area = areaRef.current;
      if (!area) return;
      const { selectionStart: start, selectionEnd: end } = area;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEndRaw = value.indexOf("\n", end);
      const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
      const lines = value.slice(lineStart, lineEnd).split("\n");

      // Already formatted that way? Then the button removes it again.
      const allMatch = lines.every((l) => matcher.test(l));
      const next = lines
        .map((line, i) => (allMatch ? line.replace(matcher, "") : prefixFor(i) + line))
        .join("\n");

      apply(value.slice(0, lineStart) + next + value.slice(lineEnd), {
        start: lineStart,
        end: lineStart + next.length,
      });
    },
    [apply, value],
  );

  const insertLink = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const { selectionStart: start, selectionEnd: end } = area;
    const text = value.slice(start, end) || "länktext";
    const snippet = `[${text}](https://)`;
    apply(value.slice(0, start) + snippet + value.slice(end), {
      // Select the URL so it can be pasted over straight away.
      start: start + text.length + 3,
      end: start + snippet.length - 1,
    });
  }, [apply, value]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      wrap("**", "fet text");
    } else if (key === "i") {
      e.preventDefault();
      wrap("*", "kursiv text");
    }
  };

  const buttons: { title: string; icon: React.ReactNode; onClick: () => void }[] = [
    { title: "Rubrik", icon: <TitleIcon fontSize="small" />, onClick: () => prefixLines(() => "## ", /^#{1,4} /) },
    { title: "Fet (Ctrl+B)", icon: <FormatBoldIcon fontSize="small" />, onClick: () => wrap("**", "fet text") },
    { title: "Kursiv (Ctrl+I)", icon: <FormatItalicIcon fontSize="small" />, onClick: () => wrap("*", "kursiv text") },
    {
      title: "Punktlista",
      icon: <FormatListBulletedIcon fontSize="small" />,
      onClick: () => prefixLines(() => "- ", /^[-*] /),
    },
    {
      title: "Numrerad lista",
      icon: <FormatListNumberedIcon fontSize="small" />,
      onClick: () => prefixLines((i) => `${i + 1}. `, /^\d+[.)] /),
    },
    { title: "Citat", icon: <FormatQuoteIcon fontSize="small" />, onClick: () => prefixLines(() => "> ", /^> ?/) },
    { title: "Kod", icon: <CodeIcon fontSize="small" />, onClick: () => wrap("`", "kod") },
    { title: "Länk", icon: <LinkIcon fontSize="small" />, onClick: insertLink },
  ];

  return (
    <Box>
      <Paper
        variant="outlined"
        sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.25, px: 0.5, py: 0.25, mb: -0.5, borderBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
      >
        <Stack direction="row" spacing={0.25} alignItems="center" flexWrap="wrap">
          {buttons.map((b) => (
            <Tooltip key={b.title} title={b.title}>
              <span>
                <IconButton size="small" onMouseDown={(e) => e.preventDefault()} onClick={b.onClick} disabled={preview}>
                  {b.icon}
                </IconButton>
              </span>
            </Tooltip>
          ))}
        </Stack>
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 0.5 }} />
        <ToggleButton
          value="preview"
          size="small"
          selected={preview}
          onChange={() => setPreview((p) => !p)}
          sx={{ border: 0, px: 1, py: 0.25, fontSize: 12, textTransform: "none" }}
        >
          <VisibilityIcon fontSize="small" sx={{ mr: 0.5 }} />
          Förhandsgranska
        </ToggleButton>
      </Paper>

      {preview ? (
        <Paper variant="outlined" sx={{ p: 2, minHeight: minRows * 24, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          <MarkdownView text={value} emptyText="Inget att förhandsgranska ännu." />
        </Paper>
      ) : (
        <TextField
          label={label}
          placeholder={placeholder}
          multiline
          minRows={minRows}
          fullWidth
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          inputRef={areaRef}
          sx={{ "& .MuiOutlinedInput-root": { borderTopLeftRadius: 0, borderTopRightRadius: 0 } }}
        />
      )}
    </Box>
  );
};

export default MarkdownEditor;
