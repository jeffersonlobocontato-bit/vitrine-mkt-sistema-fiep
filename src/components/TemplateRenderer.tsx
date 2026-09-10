import { forwardRef } from "react";

export interface TemplateField {
  key: string;
  label: string;
  /** posição/tamanho em % do canvas (0-100), definidos no editor de preset */
  x: number;
  y: number;
  w: number;
  h: number;
  font?: string;
  size?: number; // px, na resolução de referência do template (spec.width)
  color?: string;
  align?: "left" | "center" | "right";
  maxLines?: number;
}

export interface ImageSlot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormatTemplateSpec {
  width: number;
  height: number;
  backgroundUrl?: string;
  fields: TemplateField[];
  imageSlot?: ImageSlot;
}

export type TemplateSpec = Partial<Record<"card" | "carousel" | "story", FormatTemplateSpec>>;

interface Props {
  spec: FormatTemplateSpec;
  /** texto de cada campo, chaveado por field.key — gerado pela IA respeitando maxLines/tamanho de cada campo */
  values: Record<string, string>;
  imageUrl?: string | null;
  /** largura de render em px — 1080 na exportação, menor na prévia */
  previewWidth?: number;
}

/**
 * Renderer genérico do motor de preset: não decide layout, só posiciona o que o
 * designer já definiu no editor de preset (template_spec). Substitui o
 * CreativeCanvas.tsx hardcoded — um preset por Casa/campanha, não um só global.
 */
export const TemplateRenderer = forwardRef<HTMLDivElement, Props>(({ spec, values, imageUrl, previewWidth = 1080 }, ref) => {
  const scale = previewWidth / spec.width;
  const height = Math.round(spec.height * scale);

  return (
    <div
      ref={ref}
      style={{
        width: `${previewWidth}px`,
        height: `${height}px`,
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#E5E7EB",
      }}
    >
      {spec.backgroundUrl && !imageUrl && (
        <img
          src={spec.backgroundUrl}
          alt=""
          crossOrigin="anonymous"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {imageUrl && spec.imageSlot && (
        <img
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: "absolute",
            left: `${spec.imageSlot.x}%`,
            top: `${spec.imageSlot.y}%`,
            width: `${spec.imageSlot.w}%`,
            height: `${spec.imageSlot.h}%`,
            objectFit: "cover",
          }}
        />
      )}

      {spec.fields.map((f) => (
        <div
          key={f.key}
          style={{
            position: "absolute",
            left: `${f.x}%`,
            top: `${f.y}%`,
            width: `${f.w}%`,
            height: `${f.h}%`,
            fontFamily: f.font || "inherit",
            fontSize: `${Math.round((f.size ?? 32) * scale)}px`,
            color: f.color || "#111827",
            textAlign: f.align ?? "left",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: f.maxLines ?? 3,
            WebkitBoxOrient: "vertical",
            lineHeight: 1.2,
          }}
        >
          {values[f.key] ?? ""}
        </div>
      ))}
    </div>
  );
});

TemplateRenderer.displayName = "TemplateRenderer";
