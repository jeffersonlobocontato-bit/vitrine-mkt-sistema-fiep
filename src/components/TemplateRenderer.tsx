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
  /** true = preenchido com dado real (ex.: contato da unidade), nunca escrito pela IA —
   * o usuário escolhe quais dados entram aqui na tela de geração. */
  dataBound?: boolean;
}

export interface ImageSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  /** raio de cada canto, em % da menor dimensão do slot — para máscaras como "canto
   * superior-esquerdo arredondado, resto reto" (padrão comum nos cards do Sistema Fiep). */
  radiusTopLeft?: number;
  radiusTopRight?: number;
  radiusBottomRight?: number;
  radiusBottomLeft?: number;
  borderColor?: string;
  borderWidth?: number; // px, na resolução de referência do template
}

export interface FormatTemplateSpec {
  width: number;
  height: number;
  /** caminho no bucket `preset-assets` da arte de fundo fixa (logo, gradiente, textura) —
   * resolvido para signed URL pelo chamador e passado via prop `backgroundUrl`. */
  backgroundPath?: string;
  fields: TemplateField[];
  imageSlot?: ImageSlot;
}

export type TemplateSpec = Partial<Record<"card" | "carousel" | "story", FormatTemplateSpec>>;

interface Props {
  spec: FormatTemplateSpec;
  /** texto de cada campo, chaveado por field.key — gerado pela IA respeitando maxLines/tamanho de cada campo */
  values: Record<string, string>;
  /** URL já resolvida (signed) da arte de fundo fixa — ver spec.backgroundPath */
  backgroundUrl?: string | null;
  /** URL já resolvida (signed) da foto que entra no slot de imagem */
  imageUrl?: string | null;
  /** largura de render em px — 1080 na exportação, menor na prévia */
  previewWidth?: number;
}

/**
 * Renderer genérico do motor de preset: não decide layout, só posiciona o que o
 * designer já definiu no editor de preset (template_spec). Substitui o
 * CreativeCanvas.tsx hardcoded — um preset por Casa/campanha, não um só global.
 *
 * Duas camadas de imagem, sempre juntas quando presentes (não é um "ou outro"):
 * a arte de fundo fixa (logo, gradiente, textura de marca) cobre o canvas inteiro,
 * e a foto (banco de imagens ou gerada por IA) entra só na "janela" do imageSlot,
 * com máscara de cantos arredondados quando configurada.
 */
export const TemplateRenderer = forwardRef<HTMLDivElement, Props>(
  ({ spec, values, backgroundUrl, imageUrl, previewWidth = 1080 }, ref) => {
    const scale = previewWidth / spec.width;
    const height = Math.round(spec.height * scale);
    const slot = spec.imageSlot;

    const slotBorderRadius = slot
      ? `${(slot.radiusTopLeft ?? 0) * scale}px ${(slot.radiusTopRight ?? 0) * scale}px ${(slot.radiusBottomRight ?? 0) * scale}px ${(slot.radiusBottomLeft ?? 0) * scale}px`
      : undefined;

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
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            crossOrigin="anonymous"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}

        {imageUrl && slot && (
          <div
            style={{
              position: "absolute",
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width: `${slot.w}%`,
              height: `${slot.h}%`,
              overflow: "hidden",
              borderRadius: slotBorderRadius,
              boxShadow: slot.borderColor ? `inset 0 0 0 ${(slot.borderWidth ?? 3) * scale}px ${slot.borderColor}` : undefined,
            }}
          >
            <img src={imageUrl} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
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
              fontWeight: 700,
            }}
          >
            {values[f.key] ?? ""}
          </div>
        ))}
      </div>
    );
  },
);

TemplateRenderer.displayName = "TemplateRenderer";
