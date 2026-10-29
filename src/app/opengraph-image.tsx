import { ImageResponse } from "next/og";
import { BRAND, BrandMark } from "./brand-mark";

export const alt = "Veda: the AI coding playground for Indian students";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND.bg,
          padding: 80,
          color: BRAND.fg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <BrandMark size={72} />
          <div style={{ fontSize: 48, fontWeight: 700, display: "flex" }}>Veda</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05, display: "flex" }}>
            Code with AI. Pay in rupees.
          </div>
          <div style={{ fontSize: 34, color: BRAND.muted, display: "flex" }}>
            A browser IDE for Indian students. Bring your own AI key.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
