import { ImageResponse } from "next/og";
export const alt =
  "Kite — Your ideas. Onchain. Tokenized equities and thematic baskets on Solana.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#101311",
        color: "#f4f6ef",
        padding: "70px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            display: "flex",
            background: "#d5f478",
            width: 42,
            height: 42,
            transform: "rotate(45deg)",
            borderRadius: 6,
          }}
        />
        <span style={{ fontSize: 38 }}>Kite</span>
        <span style={{ fontSize: 18, marginLeft: "auto", color: "#d5f478" }}>
          SOLANA MAINNET
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", fontSize: 90, letterSpacing: -5 }}>
          Your ideas. Onchain.
        </div>
        <div style={{ display: "flex", fontSize: 30, color: "#b1bba9" }}>
          Tokenized equities. Thematic baskets. Your own wallet.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 22, color: "#d5f478" }}>
        Explore with live prices. Start in paper mode.
      </div>
    </div>,
    size,
  );
}
