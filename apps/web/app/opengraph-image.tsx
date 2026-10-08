import { ImageResponse } from "next/og";
export const alt =
  "Kite — Tokenized stocks. Your own wallet. Research, baskets and a vaultless SIP/DCA demo on Solana.";
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
        background: "#193c2b",
        color: "#f6f5ef",
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
          TOKENIZED SECURITIES · SELF-CUSTODY
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", fontSize: 84, letterSpacing: -4 }}>
          Tokenized stocks.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 84,
            letterSpacing: -4,
            color: "#d5f478",
          }}
        >
          Your own wallet.
        </div>
        <div style={{ display: "flex", fontSize: 25, color: "#bdcabb" }}>
          Research companies. Build baskets. Explore vaultless SIP/DCA.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 19, color: "#bdcabb" }}>
        Mainnet stock & basket purchases · Devnet recurring demonstration
      </div>
    </div>,
    size,
  );
}
