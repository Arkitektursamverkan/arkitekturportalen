import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, IconButton, Paper, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import CloseFullscreenIcon from "@mui/icons-material/CloseFullscreen";
import { useTranslation } from "react-i18next";
import LoadingSpinner from "@/components/common/LoadingSpinner";

/**
 * Ett fönster som visar en PDF ovanpå appen, utan att blockera den: det går
 * att flytta i titelraden, ändra storlek i nedre högra hörnet och stänga.
 * PDF:en visas med webbläsarens egen PDF-visare (sök, zoom, utskrift).
 * Läge och storlek sparas i webbläsaren till nästa gång.
 */

export interface PdfSource {
  title: string;
  /** Hämtar filen; anropas en gång när fönstret öppnas. */
  load: () => Promise<{ blob: Blob; name: string }>;
  /** Var filen finns, för "öppna i ny flik" (t.ex. SharePoint-länken). */
  sourceUrl?: string;
}

interface Rect { x: number; y: number; w: number; h: number }

const STORAGE_KEY = "ea.pdfViewer.rect";
const MIN_W = 320;
const MIN_H = 240;
const MARGIN = 8;

function defaultRect(): Rect {
  const w = Math.min(900, window.innerWidth - 2 * MARGIN);
  const h = Math.min(window.innerHeight - 2 * MARGIN, Math.round(window.innerHeight * 0.85));
  return { x: window.innerWidth - w - 24, y: Math.max(MARGIN, (window.innerHeight - h) / 2), w, h };
}

/** Håller fönstret inom webbläsarfönstret, så att titelraden alltid går att nå. */
function clamp(r: Rect): Rect {
  const w = Math.max(MIN_W, Math.min(r.w, window.innerWidth - 2 * MARGIN));
  const h = Math.max(MIN_H, Math.min(r.h, window.innerHeight - 2 * MARGIN));
  const x = Math.max(MARGIN, Math.min(r.x, window.innerWidth - w - MARGIN));
  const y = Math.max(MARGIN, Math.min(r.y, window.innerHeight - h - MARGIN));
  return { x, y, w, h };
}

function savedRect(): Rect {
  try {
    const r = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Rect | null;
    if (r && [r.x, r.y, r.w, r.h].every(Number.isFinite)) return clamp(r);
  } catch { /* ingen sparad storlek */ }
  return clamp(defaultRect());
}

type State =
  | { status: "loading" }
  | { status: "ready"; url: string; name: string }
  | { status: "error"; message: string };

const PdfViewerWindow: React.FC<{ source: PdfSource; onClose: () => void }> = ({ source, onClose }) => {
  const { t } = useTranslation();
  const [rect, setRect] = useState<Rect>(savedRect);
  const [maximized, setMaximized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<State>({ status: "loading" });
  const gesture = useRef<{ kind: "move" | "resize"; px: number; py: number; start: Rect } | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    setState({ status: "loading" });
    source.load().then(
      ({ blob, name }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setState({ status: "ready", url, name });
      },
      (e: unknown) => {
        if (!cancelled) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onResize = () => setRect((r) => clamp(r));
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [onClose]);

  const begin = (kind: "move" | "resize") => (e: React.PointerEvent) => {
    if (maximized || e.button !== 0) return;
    if (kind === "move" && (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind, px: e.clientX, py: e.clientY, start: rect };
    setDragging(true);
  };

  const move = useCallback((e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.px;
    const dy = e.clientY - g.py;
    setRect(clamp(g.kind === "move"
      ? { ...g.start, x: g.start.x + dx, y: g.start.y + dy }
      : { ...g.start, w: g.start.w + dx, h: g.start.h + dy }));
  }, []);

  const end = useCallback(() => {
    if (!gesture.current) return;
    gesture.current = null;
    setDragging(false);
    setRect((r) => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch { /* sparas inte */ }
      return r;
    });
  }, []);

  const shown = maximized
    ? { x: MARGIN, y: MARGIN, w: window.innerWidth - 2 * MARGIN, h: window.innerHeight - 2 * MARGIN }
    : rect;

  const download = () => {
    if (state.status !== "ready") return;
    const a = document.createElement("a");
    a.href = state.url;
    a.download = state.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Paper
      role="dialog"
      aria-label={source.title}
      elevation={12}
      sx={{
        position: "fixed", left: shown.x, top: shown.y, width: shown.w, height: shown.h,
        zIndex: (theme) => theme.zIndex.modal - 1,
        display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 1.5,
      }}
    >
      <Box
        onPointerDown={begin("move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button")) setMaximized((m) => !m); }}
        sx={{
          display: "flex", alignItems: "center", gap: 0.5, pl: 1.5, pr: 0.5, py: 0.25,
          bgcolor: "primary.main", color: "primary.contrastText",
          cursor: maximized ? "default" : dragging ? "grabbing" : "grab", userSelect: "none", touchAction: "none",
        }}
      >
        <Typography variant="subtitle2" noWrap sx={{ flex: 1 }} title={source.title}>{source.title}</Typography>
        {state.status === "ready" && (
          <Tooltip title={t("pdfViewer.download")}>
            <IconButton size="small" color="inherit" onClick={download}><DownloadIcon fontSize="small" /></IconButton>
          </Tooltip>
        )}
        {source.sourceUrl && (
          <Tooltip title={t("pdfViewer.openSource")}>
            <IconButton size="small" color="inherit" component="a" href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title={maximized ? t("pdfViewer.restore") : t("pdfViewer.maximize")}>
          <IconButton size="small" color="inherit" onClick={() => setMaximized((m) => !m)}>
            {maximized ? <CloseFullscreenIcon fontSize="small" /> : <OpenInFullIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title={t("common.close")}>
          <IconButton size="small" color="inherit" onClick={onClose} aria-label={t("common.close")}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flex: 1, position: "relative", bgcolor: "grey.100" }}>
        {state.status === "loading" && <LoadingSpinner height="100%" />}
        {state.status === "error" && (
          <Box sx={{ p: 2 }}>
            <Alert severity="warning">{state.message}</Alert>
            {source.sourceUrl && (
              <Button sx={{ mt: 2 }} variant="outlined" startIcon={<OpenInNewIcon />} href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                {t("pdfViewer.openSource")}
              </Button>
            )}
          </Box>
        )}
        {state.status === "ready" && (
          <Box
            component="iframe"
            src={state.url}
            title={source.title}
            // Ramen fångar annars musen så att flytt och storleksändring tappar greppet.
            sx={{ border: 0, width: "100%", height: "100%", display: "block", pointerEvents: dragging ? "none" : "auto" }}
          />
        )}
        {!maximized && (
          <Box
            aria-hidden
            onPointerDown={begin("resize")}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            sx={{
              position: "absolute", right: 0, bottom: 0, width: 18, height: 18, cursor: "nwse-resize", touchAction: "none",
              background: (theme) =>
                `linear-gradient(135deg, transparent 50%, ${theme.palette.grey[500]} 50%, ${theme.palette.grey[500]} 60%, transparent 60%, transparent 70%, ${theme.palette.grey[500]} 70%, ${theme.palette.grey[500]} 80%, transparent 80%)`,
            }}
          />
        )}
      </Box>
    </Paper>
  );
};

export default PdfViewerWindow;
