import { loadFont } from "@remotion/google-fonts/BricolageGrotesque";

export const { fontFamily } = loadFont("normal", {
  weights: ["500", "800"],
  subsets: ["latin"],
});

// A plain playing card face. Motion lives on the Interactive wrapper around it.
export const CardFace: React.FC<{ rank: string; suit: string }> = ({
  rank,
  suit,
}) => {
  const color = suit === "♥" || suit === "♦" ? "#c8323c" : "#16181d";
  return (
    <div
      style={{
        width: 220,
        height: 310,
        borderRadius: 22,
        backgroundColor: "#fbf8f1",
        boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
        color,
        fontFamily,
        fontWeight: 800,
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 16, left: 22, fontSize: 52, lineHeight: 1 }}>
        {rank}
        <div style={{ fontSize: 40 }}>{suit}</div>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 130,
        }}
      >
        {suit}
      </div>
    </div>
  );
};
