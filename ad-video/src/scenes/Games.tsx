import { AbsoluteFill, Easing, Interactive, interpolate, Sequence, useCurrentFrame } from "remotion";
import { fontFamily } from "../ui";

// Frame is local to the wrapping <Sequence>, so each tile animates from its own start.
const Tile: React.FC<{ glyph: string; name: string; players: string }> = ({
  glyph,
  name,
  players,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width: 500,
        height: 250,
        borderRadius: 32,
        backgroundColor: "rgba(246,241,231,0.08)",
        border: "2px solid rgba(242,193,78,0.35)",
        display: "flex",
        alignItems: "center",
        gap: 32,
        padding: "0 40px",
        opacity: interpolate(frame, [0, 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        scale: interpolate(frame, [0, 16], [0.85, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.spring({ damping: 14 }),
          output: "perceptual-scale",
        }),
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: "#f2c14e",
          color: "#0b2e22",
          fontSize: 64,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {glyph}
      </div>
      <div>
        <div style={{ fontSize: 50, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
        <div style={{ fontSize: 34, fontWeight: 500, opacity: 0.75, marginTop: 8 }}>{players}</div>
      </div>
    </div>
  );
};

export const Games: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Games"
      style={{
        background: "radial-gradient(circle at 50% 30%, #1d6b4f 0%, #0b2e22 75%)",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        color: "#f6f1e7",
      }}
    >
      <Interactive.Div
        name="Headline"
        style={{
          fontSize: 110,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          marginBottom: 70,
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Six games. One link.
      </Interactive.Div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 500px)",
          gap: 36,
        }}
      >
        <Sequence name="Hold'em" from={10} layout="none">
          <Tile glyph="♠" name="Texas Hold'em" players="1–10 players" />
        </Sequence>
        <Sequence name="Blackjack" from={16} layout="none">
          <Tile glyph="21" name="Blackjack" players="1–7 players" />
        </Sequence>
        <Sequence name="Roulette" from={22} layout="none">
          <Tile glyph="0" name="Roulette" players="1–10 players" />
        </Sequence>
        <Sequence name="Pool" from={28} layout="none">
          <Tile glyph="8" name="Eight-Ball Pool" players="1–4 players" />
        </Sequence>
        <Sequence name="Pok Deng" from={34} layout="none">
          <Tile glyph="♦" name="Pok Deng" players="1–7 players" />
        </Sequence>
        <Sequence name="Slave" from={40} layout="none">
          <Tile glyph="♚" name="Slave" players="1–8 players" />
        </Sequence>
      </div>
      <Interactive.Div
        name="Bots note"
        style={{
          fontSize: 44,
          fontWeight: 500,
          color: "#f2c14e",
          marginTop: 60,
          opacity: interpolate(frame, [60, 74], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Short on players? Bots fill the empty seats.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
