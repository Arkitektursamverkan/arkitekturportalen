import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";

/**
 * The box that says WHAT the picture is: its name, and — when the picture
 * came with one — a description and where it comes from.
 *
 * It used to be fixed in the top left corner at up to 640 px, and a long
 * description then covered the part of the picture a reader wanted to see.
 * Now it can be moved (drag the header), resized (drag its corner) and
 * minimised to the name alone. The choice is the reader's and is remembered in
 * this browser, across pictures — FlowSceneView is remounted when the picture
 * changes, so the state cannot live there.
 */

const KEY = "flowScene.infoBox";

export interface InfoBoxState {
  x: number;
  y: number;
  /** Width and height once the reader has resized it; absent = fits its text. */
  w?: number;
  h?: number;
  minimised: boolean;
}

const START: InfoBoxState = { x: 12, y: 8, minimised: false };

export function readInfoBoxState(storage: Pick<Storage, "getItem"> = localStorage): InfoBoxState {
  try {
    const v = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!v || typeof v !== "object") return START;
    const tal = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : undefined);
    return {
      x: Math.max(0, tal(v.x) ?? START.x),
      y: Math.max(0, tal(v.y) ?? START.y),
      ...(tal(v.w) ? { w: Math.max(160, tal(v.w)!) } : {}),
      ...(tal(v.h) ? { h: Math.max(40, tal(v.h)!) } : {}),
      minimised: v.minimised === true,
    };
  } catch {
    return START;
  }
}

/** Keeps the box's handle reachable: at least `synligt` px of it inside the canvas. */
export function clampInfoBox(x: number, y: number, yta: { width: number; height: number }, synligt = 60): { x: number; y: number } {
  return {
    x: Math.min(Math.max(0, x), Math.max(0, yta.width - synligt)),
    y: Math.min(Math.max(0, y), Math.max(0, yta.height - 32)),
  };
}

interface Props {
  caption: string;
  /**
   * The picture's information classification, when Arkitekten sends one. It
   * stays visible when the box is minimised: how the picture may be handled
   * matters before anything else in it.
   */
  klassning?: string;
  beskrivning?: string;
  info?: React.ReactNode;
}

export default function FlowInfoBox({ caption, klassning, beskrivning, info }: Props) {
  const { t } = useTranslation();
  const [läge, setLäge] = useState<InfoBoxState>(() => readInfoBoxState());
  const ruta = useRef<HTMLDivElement | null>(null);
  const drar = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const harMer = Boolean(beskrivning || info);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(läge));
    } catch {
      // A full or blocked storage only costs the memory of the position.
    }
  }, [läge]);

  // A box left outside a canvas that has since shrunk is brought back in.
  useEffect(() => {
    const yta = ruta.current?.parentElement?.getBoundingClientRect();
    if (!yta) return;
    setLäge((l) => {
      const p = clampInfoBox(l.x, l.y, yta);
      return p.x === l.x && p.y === l.y ? l : { ...l, ...p };
    });
  }, []);

  const påNer = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drar.current = { px: e.clientX, py: e.clientY, x: läge.x, y: läge.y };
  };
  const påRör = (e: React.PointerEvent) => {
    const d = drar.current;
    if (!d || !(e.buttons & 1)) return;
    const yta = ruta.current?.parentElement?.getBoundingClientRect();
    if (!yta) return;
    setLäge((l) => ({ ...l, ...clampInfoBox(d.x + e.clientX - d.px, d.y + e.clientY - d.py, yta) }));
  };
  const påUpp = (e: React.PointerEvent) => {
    drar.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  /** The browser resizes the box (CSS `resize`); remember what the reader chose. */
  const minnsStorlek = () => {
    const el = ruta.current;
    if (!el || läge.minimised || !el.style.width) return;
    const w = Math.round(el.offsetWidth);
    const h = Math.round(el.offsetHeight);
    setLäge((l) => (l.w === w && l.h === h ? l : { ...l, w, h }));
  };

  const öppen = harMer && !läge.minimised;

  return (
    <Paper
      ref={ruta}
      variant="outlined"
      onPointerUp={minnsStorlek}
      // Clicks and drags in the box are the box's, not the canvas's.
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      sx={{
        position: "absolute", left: läge.x, top: läge.y, zIndex: 2,
        maxWidth: "calc(100% - 16px)", maxHeight: "calc(100% - 16px)",
        display: "flex", flexDirection: "column",
        ...(öppen
          ? { resize: "both", overflow: "auto", minWidth: 200, minHeight: 56, width: läge.w ?? "min(420px, calc(100% - 24px))", height: läge.h }
          : { overflow: "hidden" }),
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        onPointerDown={påNer}
        onPointerMove={påRör}
        onPointerUp={påUpp}
        onPointerCancel={påUpp}
        sx={{ alignItems: "center", pl: 0.25, pr: 0.5, py: 0.25, cursor: "move", touchAction: "none", userSelect: "none", flexShrink: 0 }}
        title={t("flowScene.infoMove")}
      >
        <DragIndicatorIcon sx={{ fontSize: 16, color: "text.disabled" }} />
        <Typography variant="caption" sx={{ flexGrow: 1, fontWeight: harMer ? 600 : 400 }} noWrap={!öppen}>
          {caption}
        </Typography>
        {klassning && (
          <Tooltip title={t("flowScene.classificationTitle")}>
            <Chip
              size="small"
              icon={<ShieldOutlinedIcon />}
              label={klassning}
              aria-label={`${t("flowScene.classificationTitle")}: ${klassning}`}
              sx={{ height: 20, fontSize: 11, maxWidth: 260, bgcolor: "#f6f2fc", color: "#3f2a6b", "& .MuiChip-icon": { fontSize: 14, color: "inherit" } }}
            />
          </Tooltip>
        )}
        {harMer && (
          <Tooltip title={läge.minimised ? t("flowScene.infoShow") : t("flowScene.infoHide")}>
            <IconButton
              size="small"
              sx={{ p: 0.25 }}
              aria-expanded={!läge.minimised}
              aria-label={läge.minimised ? t("flowScene.infoShow") : t("flowScene.infoHide")}
              // The button must not start a drag of the box.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setLäge((l) => ({ ...l, minimised: !l.minimised }))}
            >
              {läge.minimised ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}
      </Stack>
      {öppen && (
        <Box sx={{ px: 1, pb: 0.75 }}>
          {beskrivning && (
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", whiteSpace: "pre-line" }}>
              {beskrivning}
            </Typography>
          )}
          {info && <Box sx={{ mt: 0.5, typography: "caption" }}>{info}</Box>}
        </Box>
      )}
    </Paper>
  );
}
