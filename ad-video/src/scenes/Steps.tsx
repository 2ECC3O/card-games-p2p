import { AbsoluteFill, Easing, Interactive, interpolate, Sequence, useCurrentFrame } from "remotion";
import { fontFamily } from "../ui";

// Frame is local to the wrapping <Sequence>, so each step animates from its own start.
const Step: React.FC<{ n: number; text: string; children: React.ReactNode }> = ({
  n,
  text,
  children,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width: 480,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 36,
        opacity: interpolate(frame, [0, 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [0, 18], ["0px 60px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div
        style={{
          width: 110,
          height: 110,
          borderRadius: 55,
          border: "4px solid #f2c14e",
          color: "#f2c14e",
          fontSize: 60,
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </div>
      <div style={{ height: 150, display: "flex", alignItems: "center" }}>{children}</div>
      <div style={{ fontSize: 52, fontWeight: 800, textAlign: "center", lineHeight: 1.1 }}>{text}</div>
    </div>
  );
};

const Button: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      padding: "28px 56px",
      borderRadius: 999,
      backgroundColor: "#f2c14e",
      color: "#0b2e22",
      fontSize: 48,
      fontWeight: 800,
      boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
    }}
  >
    {label}
  </div>
);

export const Steps: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Steps"
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
          marginBottom: 90,
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Dealt in under a minute.
      </Interactive.Div>
      <div style={{ display: "flex", gap: 60 }}>
        <Sequence name="Step 1" from={12} layout="none">
          <Step n={1} text="Open a room">
            <Button label="Create room" />
          </Step>
        </Sequence>
        <Sequence name="Step 2" from={32} layout="none">
          <Step n={2} text="Share the code">
            <div
              style={{
                padding: "20px 44px",
                borderRadius: 24,
                border: "3px dashed rgba(246,241,231,0.6)",
                fontSize: 80,
                fontWeight: 800,
                letterSpacing: "0.12em",
              }}
            >
              K7QX
            </div>
          </Step>
        </Sequence>
        <Sequence name="Step 3" from={52} layout="none">
          <Step n={3} text="Deal the first hand">
            <Button label="Start" />
          </Step>
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
