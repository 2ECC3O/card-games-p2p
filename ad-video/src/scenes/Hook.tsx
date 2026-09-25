import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { CardFace, fontFamily } from "../ui";

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Hook"
      style={{
        background: "radial-gradient(circle at 50% 40%, #1d6b4f 0%, #0b2e22 75%)",
        alignItems: "center",
        justifyContent: "center",
        fontFamily,
        color: "#f6f1e7",
      }}
    >
      <div style={{ position: "relative", width: 900, height: 380 }}>
        <Interactive.Div
          name="Card A"
          style={{
            position: "absolute",
            left: 340,
            top: 30,
            transformOrigin: "50% 100%",
            translate: interpolate(frame, [0, 20], ["-210px 900px", "-210px 30px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
            rotate: interpolate(frame, [0, 20], ["0deg", "-18deg"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
          }}
        >
          <CardFace rank="A" suit="♠" />
        </Interactive.Div>
        <Interactive.Div
          name="Card K"
          style={{
            position: "absolute",
            left: 340,
            top: 30,
            transformOrigin: "50% 100%",
            translate: interpolate(frame, [4, 24], ["-70px 900px", "-70px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
            rotate: interpolate(frame, [4, 24], ["0deg", "-6deg"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
          }}
        >
          <CardFace rank="K" suit="♥" />
        </Interactive.Div>
        <Interactive.Div
          name="Card Q"
          style={{
            position: "absolute",
            left: 340,
            top: 30,
            transformOrigin: "50% 100%",
            translate: interpolate(frame, [8, 28], ["70px 900px", "70px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
            rotate: interpolate(frame, [8, 28], ["0deg", "6deg"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
          }}
        >
          <CardFace rank="Q" suit="♦" />
        </Interactive.Div>
        <Interactive.Div
          name="Card J"
          style={{
            position: "absolute",
            left: 340,
            top: 30,
            transformOrigin: "50% 100%",
            translate: interpolate(frame, [12, 32], ["210px 900px", "210px 30px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
            rotate: interpolate(frame, [12, 32], ["0deg", "18deg"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.spring({ damping: 200 }),
            }),
          }}
        >
          <CardFace rank="J" suit="♣" />
        </Interactive.Div>
      </div>
      <Interactive.Div
        name="Title"
        style={{
          fontSize: 150,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          marginTop: 40,
          opacity: interpolate(frame, [22, 36], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [22, 40], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        Game night, tonight.
      </Interactive.Div>
      <Interactive.Div
        name="Subtitle"
        style={{
          fontSize: 56,
          fontWeight: 500,
          color: "#f2c14e",
          marginTop: 8,
          opacity: interpolate(frame, [40, 54], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        No app. No sign-up. Just a link.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
