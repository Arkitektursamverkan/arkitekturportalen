import React from "react";
import { Box } from "@mui/material";

export type DomainKey = "business" | "data" | "application" | "technology";

const DOMAIN_COLORS: Record<DomainKey, string> = {
  business: "#4CAF50",
  data: "#FF9800",
  application: "#2196F3",
  technology: "#9C27B0",
};
const MUTED = "#EEEEEE";
const STROKE = "#9AA0A6";

// BDAT letter, English name, Swedish name in brackets underneath. The top
// layer is lettered smaller — its triangle is only some 40 units wide.
const LAYERS: Array<{
  key: DomainKey;
  label: string;
  sub: string;
  points: string;
  textY: number;
  fontSize: number;
}> = [
  { key: "business",    label: "B – Business",    sub: "(Verksamhet)",  points: "200,40 230,100 170,100",          textY: 78,  fontSize: 10 },
  { key: "data",        label: "D – Data",        sub: "(Information)", points: "230,100 260,160 140,160 170,100", textY: 132, fontSize: 11 },
  { key: "application", label: "A – Application", sub: "(Applikation)", points: "260,160 290,220 110,220 140,160", textY: 192, fontSize: 11 },
  { key: "technology",  label: "T – Technology",  sub: "(Teknik)",      points: "290,220 320,280 80,280 110,220",  textY: 252, fontSize: 11 },
];

// The right-hand labels are wrapped by hand: a single line runs past the
// viewBox and gets clipped, and SVG text does not wrap on its own.
const SIDE_LABELS: Record<DomainKey, { why: string; what: string[] }> = {
  business:    { why: "Varför",  what: ["Strategi och", "processer"] },
  data:        { why: "Vad",     what: ["Begrepp och", "informationsflöden"] },
  application: { why: "Hur",     what: ["Applikationer", "och tjänster"] },
  technology:  { why: "Med vad", what: ["Infrastruktur", "och plattform"] },
};

/** x where the right-hand labels start, and where their leader line stops. */
const LABEL_X = 340;
const LINE_HEIGHT = 10;

interface Props {
  highlight?: DomainKey | null;
  showSideLabels?: boolean;
  caption?: string;        // text below the pyramid
  height?: number | string;
  /** When given, each layer becomes clickable and reports which one was picked. */
  onSelect?: (key: DomainKey) => void;
}

export const DomainPyramid: React.FC<Props> = ({
  highlight = null,
  showSideLabels = false,
  caption,
  height = 360,
  onSelect,
}) => {
  const colorFor = (key: DomainKey) =>
    highlight == null || highlight === key ? DOMAIN_COLORS[key] : MUTED;
  const textColorFor = (key: DomainKey) =>
    highlight == null || highlight === key ? "#1a1a1a" : "#888";

  return (
    <Box sx={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <svg
        viewBox={showSideLabels ? "-40 0 480 340" : "0 0 400 340"}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", maxWidth: 600, height }}
      >
        {/* Dashed enclosing circle — the holistic frame */}
        <ellipse
          cx={200}
          cy={160}
          rx={185}
          ry={155}
          fill="none"
          stroke={STROKE}
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />

        {/* Pyramid layers */}
        {LAYERS.map((layer) => {
          const fill = colorFor(layer.key);
          const tcolor = textColorFor(layer.key);
          return (
            <g
              key={layer.key}
              onClick={onSelect ? () => onSelect(layer.key) : undefined}
              style={onSelect ? { cursor: "pointer" } : undefined}
            >
              <polygon
                points={layer.points}
                fill={fill}
                stroke={highlight === layer.key ? "#222" : "transparent"}
                strokeWidth={highlight === layer.key ? 1.5 : 0}
              />
              <text
                x={200}
                y={layer.textY}
                textAnchor="middle"
                fontSize={layer.fontSize}
                fontWeight={highlight === layer.key ? 700 : 600}
                fill={tcolor}
                fontFamily="inherit"
              >
                {layer.label}
              </text>
              <text
                x={200}
                y={layer.textY + 12}
                textAnchor="middle"
                fontSize={9}
                fill={tcolor}
                opacity={0.85}
                fontFamily="inherit"
              >
                {layer.sub}
              </text>
            </g>
          );
        })}

        {/* Side labels (overall view) */}
        {showSideLabels && (
          <>
            {LAYERS.map((layer) => {
              const sl = SIDE_LABELS[layer.key];
              const y = layer.textY + 6;
              // Centre the wrapped label block on the leader line.
              const firstLineY = y + 3 - ((sl.what.length - 1) * LINE_HEIGHT) / 2;
              return (
                <g key={`side-${layer.key}`} fontSize={9} fill="#444" fontFamily="inherit">
                  <line x1={50} y1={y} x2={layer.key === "business" ? 165 : layer.key === "data" ? 135 : layer.key === "application" ? 105 : 75} y2={y} stroke={STROKE} strokeDasharray="2 2" />
                  <text x={45} y={y + 3} textAnchor="end">{sl.why}</text>
                  <line x1={layer.key === "business" ? 235 : layer.key === "data" ? 265 : layer.key === "application" ? 295 : 325} y1={y} x2={LABEL_X - 6} y2={y} stroke={STROKE} strokeDasharray="2 2" />
                  <text x={LABEL_X} y={firstLineY} textAnchor="start">
                    {sl.what.map((line, i) => (
                      <tspan key={line} x={LABEL_X} dy={i === 0 ? 0 : LINE_HEIGHT}>{line}</tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {caption && (
          <text x={200} y={325} textAnchor="middle" fontSize={10} fill="#555" fontFamily="inherit">
            {caption}
          </text>
        )}
      </svg>
    </Box>
  );
};

export default DomainPyramid;
