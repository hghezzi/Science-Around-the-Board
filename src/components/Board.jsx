// src/components/Board.jsx
// The 36-tile square board. Tile 0 is the bottom-right corner (START) and play
// runs clockwise: bottom row right→left, left column bottom→top, top row
// left→right, right column top→bottom. Sizes use container-query units so the
// board scales with the window; colours come from theme CSS variables.

import React from "react";
import { motion } from "framer-motion";
import { v, TEAM_SYMBOLS } from "../theme";

/** Grid position and which edge a tile sits on. */
function tilePlacement(index) {
  if (index === 0) return { row: 10, col: 10, edge: "corner" };
  if (index < 9) return { row: 10, col: 10 - index, edge: "bottom" };
  if (index === 9) return { row: 10, col: 1, edge: "corner" };
  if (index < 18) return { row: 10 - (index - 9), col: 1, edge: "left" };
  if (index === 18) return { row: 1, col: 1, edge: "corner" };
  if (index < 27) return { row: 1, col: 1 + (index - 18), edge: "top" };
  if (index === 27) return { row: 1, col: 10, edge: "corner" };
  return { row: 1 + (index - 27), col: 10, edge: "right" };
}

// The colour band sits on the edge facing the centre of the board.
const BAND = {
  bottom: { top: 0, left: 0, right: 0, height: "22%" },
  top: { bottom: 0, left: 0, right: 0, height: "22%" },
  left: { top: 0, bottom: 0, right: 0, width: "22%" },
  right: { top: 0, bottom: 0, left: 0, width: "22%" },
};
const BODY_PAD = {
  bottom: { paddingTop: "24%" },
  top: { paddingBottom: "24%" },
  left: { paddingRight: "24%" },
  right: { paddingLeft: "24%" },
  corner: {},
};

export function Pawn({ player, size = "2.6cqw" }) {
  return (
    <motion.div
      layoutId={`pawn-${player.id}`}
      transition={{ duration: 0.18, ease: "linear" }}
      title={player.name}
      aria-hidden
      style={{
        width: size,
        height: size,
        minWidth: 14,
        minHeight: 14,
        borderRadius: "50%",
        background: player.color,
        border: `2px solid ${v("common.white")}`,
        boxShadow: `0 2px 4px ${v("board.shadow")}`,
        color: v("common.white"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: `calc(${size} * 0.55)`,
        lineHeight: 1,
        textShadow: "0 0 2px rgba(0,0,0,0.7)",
        zIndex: 5,
      }}
    >
      {TEAM_SYMBOLS[player.id]}
    </motion.div>
  );
}

function OwnerBadge({ owner }) {
  return (
    <span
      title={`Owned by ${owner.name}`}
      aria-hidden
      style={{
        position: "absolute",
        top: 2,
        right: 2,
        width: "1.9cqw",
        height: "1.9cqw",
        minWidth: 12,
        minHeight: 12,
        borderRadius: "50%",
        background: owner.color,
        color: v("common.white"),
        fontSize: "max(8px, 1.1cqw)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textShadow: "0 0 2px rgba(0,0,0,0.7)",
        zIndex: 3,
      }}
    >
      {TEAM_SYMBOLS[owner.id]}
    </span>
  );
}

const ICONS = { milestone: "🏆", sequencing_core: "⚙️", chance: "🃏" };

function Tile({ tile, index, owner, pawns, onHover, onLeave }) {
  const { row, col, edge } = tilePlacement(index);
  const isCorner = edge === "corner";
  const ownerRing = owner ? `0 0 0 3px ${owner.color} inset` : "none";
  const label = tile.type === "property" ? tile.sub : tile.name;
  // Shrink long single words so they fit without breaking mid-word.
  const longest = Math.max(1, ...String(label || "").split(/\s+/).map((w) => w.length));
  const fit = Math.min(1, (isCorner || edge === "left" || edge === "right" ? 12 : 9) / longest);
  const aria = [
    tile.type === "property" ? `${tile.name}: ${tile.sub}` : tile.name,
    tile.isStart ? "start" : null,
    tile.price ? `price $${tile.price}` : null,
    owner ? `owned by ${owner.name}` : null,
    tile.level ? `level ${tile.level}` : null,
    pawns.length ? `${pawns.map((p) => p.name).join(" and ")} ${pawns.length > 1 ? "are" : "is"} here` : null,
  ].filter(Boolean).join(", ");

  return (
    <div
      role="img"
      tabIndex={0}
      aria-label={aria}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      style={{
        gridRow: row,
        gridColumn: col,
        position: "relative",
        background: isCorner
          ? `linear-gradient(135deg, ${tile.color}33, ${v("board.tile")} 70%)`
          : v("board.tile"),
        border: `1px solid ${v("board.tileBorder")}`,
        borderRadius: isCorner ? 10 : 6,
        boxShadow: ownerRing,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: v("board.ink"),
        outlineOffset: 2,
        ...BODY_PAD[edge],
      }}
    >
      {tile.type === "property" && !isCorner && (
        <div style={{ position: "absolute", background: tile.color, ...BAND[edge] }} />
      )}
      {owner && <OwnerBadge owner={owner} />}

      {ICONS[tile.type] && (
        <div aria-hidden style={{ fontSize: isCorner ? "3.4cqw" : "2.4cqw", lineHeight: 1.1 }}>{ICONS[tile.type]}</div>
      )}
      <div
        style={{
          fontWeight: 800,
          fontSize: `max(8.5px, calc(${isCorner ? 1.6 : 1.5}cqw * ${fit.toFixed(3)}))`,
          lineHeight: 1.15,
          padding: "0 0.4cqw",
          maxWidth: "100%",
          overflowWrap: "break-word",
          hyphens: "auto",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {label}
      </div>
      {tile.isStart && (
        <div style={{ marginTop: 2, fontSize: "max(8px, 1.15cqw)", fontWeight: 800, color: v("error.contrastText"), background: v("error.main"), borderRadius: 4, padding: "0 4px", letterSpacing: "0.05em" }}>
          START · +$200
        </div>
      )}
      {tile.level > 0 && (
        <div aria-hidden style={{ fontSize: "1.2cqw", letterSpacing: -1 }}>{"⭐".repeat(tile.level)}</div>
      )}
      {tile.price > 0 && !tile.isStart && (
        <div style={{ marginTop: 1, fontSize: "max(8px, 1.3cqw)", fontWeight: 700, color: v("board.muted") }}>${tile.price}</div>
      )}

      {pawns.length > 0 && (
        <div style={{ position: "absolute", ...(isCorner ? { top: 3, left: 3 } : { bottom: 3, left: 0, right: 0, justifyContent: "center" }), display: "flex", gap: 2, flexWrap: "wrap" }}>
          {pawns.map((p) => <Pawn key={p.id} player={p} />)}
        </div>
      )}
    </div>
  );
}

export default function Board({ board, players, onTileHover, onTileLeave, children }) {
  return (
    <div
      role="region"
      aria-label="Game board"
      style={{
        containerType: "inline-size",
        width: "min(100%, calc(100vh - 110px), 1000px)",
        minWidth: 600,
        aspectRatio: "1 / 1",
        display: "grid",
        gridTemplateColumns: "1.5fr repeat(8, 1fr) 1.5fr",
        gridTemplateRows: "1.5fr repeat(8, 1fr) 1.5fr",
        gap: "0.35cqw",
        padding: "1cqw",
        background: v("board.felt"),
        borderRadius: 18,
        boxShadow: `0 12px 36px ${v("board.shadow")}`,
      }}
    >
      {/* Centre first in the DOM so keyboard users reach the dice before the 36 tiles. */}
      <div
        style={{
          gridRow: "2 / 10",
          gridColumn: "2 / 10",
          background: v("board.center"),
          borderRadius: 14,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.2cqw",
          padding: "2cqw",
          color: v("board.ink"),
          overflow: "auto",
        }}
      >
        {children}
      </div>
      {board.map((tile, index) => (
        <Tile
          key={tile.id}
          tile={tile}
          index={index}
          owner={tile.owner != null && tile.owner !== 99 ? players[tile.owner] : null}
          pawns={players.filter((p) => p.position === index && !p.eliminated)}
          onHover={() => onTileHover(tile)}
          onLeave={onTileLeave}
        />
      ))}
    </div>
  );
}
