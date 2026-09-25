import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { fontFamily } from "../ui";

export const Cta: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="CTA"
      style={{
        background: "radial-gradient(circle at 50% 45%, #1d6b4f 0%, #0b2e22 75%)",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        color: "#f6f1e7",
      }}
    >
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 160,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          scale: interpolate(frame, [0, 20], [0.9, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 12 }),
            output: "perceptual-scale",
          }),
          opacity: interpolate(frame, [0, 10], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Deal your friends in.
      </Interactive.Div>
      <Interactive.Div
        name="URL"
        style={{
          marginTop: 50,
          padding: "26px 60px",
          borderRadius: 999,
          backgroundColor: "#f2c14e",
          color: "#0b2e22",
          fontSize: 60,
          fontWeight: 800,
          boxShadow: "0 20px 50px rgba(0,0,0,0.4)",
          opacity: interpolate(frame, [14, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [14, 30], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        2ecc3o.github.io/card-games-p2p
      </Interactive.Div>
      <Interactive.Div
        name="Tagline"
        style={{
          marginTop: 50,
          fontSize: 48,
          fontWeight: 500,
          opacity: interpolate(frame, [30, 44], [0, 0.85], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Free. Friends join from anywhere, even on mobile data.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
