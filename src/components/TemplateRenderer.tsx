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
  /** caminho no bucket `preset-assets` de uma moldura pronta (PNG com transparência, ex.:
   * "Contorno_Container_Foto.png") desenhada por cima da foto — quando presente, muda o modo
   * de composição (ver nota de camadas no componente abaixo). */
  framePath?: string;
  /** caminho no bucket `preset-assets` da máscara real do recorte (PNG preenchido, ex.:
   * "Container_Foto.png") — quando presente, recorta a foto pixel a pixel pelo alfa dessa
   * imagem (via CSS mask-image) em vez de aproximar por raio de canto; garante que a foto se
   * encaixe exatamente na forma desenhada pelo design (inclusive recortes em degrau). */
  maskPath?: string;
}

/** Elemento gráfico fixo (logo, selo, ícone, palavra-chave já desenhada) — sempre a mesma
 * imagem em toda geração, nunca decidido pela IA. Posição/tamanho em % do canvas. */
export interface StickerAsset {
  key: string;
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormatTemplateSpec {
  width: number;
  height: number;
  /** caminho no bucket `preset-assets` da arte de fundo fixa (logo, gradiente, textura) —
   * resolvido para signed URL pelo chamador e passado via prop `backgroundUrl`. */
  backgroundPath?: string;
  /** variações de fundo (ex.: pacote com Fundo_01/02/03) — quando presente, uma é sorteada a
   * cada geração; tem prioridade sobre `backgroundPath`. */
  backgroundPaths?: string[];
  fields: TemplateField[];
  imageSlot?: ImageSlot;
  stickers?: StickerAsset[];
  /** tipografia de marca importada (ex.: fonte Foun) — nome e caminho (arquivo .ttf/.otf) no
   * bucket `preset-assets`; resolvido para signed URL pelo chamador e passado via prop `fontUrl`. */
  fontFamily?: string;
  fontPath?: string;
}

export type TemplateSpec = Partial<Record<"card" | "carousel" | "story", FormatTemplateSpec>>;

interface Props {
  spec: FormatTemplateSpec;
  /** texto de cada campo, chaveado por field.key — gerado pela IA respeitando maxLines/tamanho de cada campo */
  values: Record<string, string>;
  /** URL já resolvida (signed) da arte de fundo fixa — ver spec.backgroundPath/backgroundPaths */
  backgroundUrl?: string | null;
  /** URL já resolvida (signed) da foto que entra no slot de imagem */
  imageUrl?: string | null;
  /** URL já resolvida (signed) da moldura — ver spec.imageSlot.framePath */
  frameUrl?: string | null;
  /** URL já resolvida (signed) da máscara de recorte — ver spec.imageSlot.maskPath */
  maskUrl?: string | null;
  /** URLs já resolvidas (signed) dos elementos gráficos fixos, chaveadas por sticker.key */
  stickerUrls?: Record<string, string>;
  /** URL já resolvida (signed) do arquivo de fonte — ver spec.fontPath */
  fontUrl?: string | null;
  /** largura de render em px — 1080 na exportação, menor na prévia */
  previewWidth?: number;
}

/**
 * Renderer genérico do motor de preset: não decide layout, só posiciona o que o
 * designer já definiu no editor de preset (template_spec). Substitui o
 * CreativeCanvas.tsx hardcoded — um preset por Casa/campanha, não um só global.
 *
 * Duas camadas de imagem, sempre juntas quando presentes (não é um "ou outro"). Existem dois
 * modos de composição, escolhidos automaticamente pela presença de uma moldura (frameUrl):
 *
 * - **Sem moldura própria** (preset legado, ex.: card do Sesi original): a arte de fundo é um
 *   PNG único já com a "janela" da foto recortada (transparente) — a foto entra ATRÁS e a arte
 *   de fundo cobre por cima, então ela só aparece através do recorte. A borda do slot (CSS) fica
 *   por cima de tudo.
 * - **Com moldura própria** (pacote de componentes separados, ex.: fundo opaco + Contorno_*.png):
 *   a arte de fundo é opaca e cobre o canvas por trás de tudo; a foto entra por cima, recortada
 *   pelo slot; a moldura (PNG com transparência) é desenhada por cima da foto para fechar a
 *   composição — nesse modo não faz sentido desenhar o fundo de novo sobre a foto.
 */
export const TemplateRenderer = forwardRef<HTMLDivElement, Props>(
  ({ spec, values, backgroundUrl, imageUrl, frameUrl, maskUrl, stickerUrls, fontUrl, previewWidth = 1080 }, ref) => {
    const scale = previewWidth / spec.width;
    const height = Math.round(spec.height * scale);
    const slot = spec.imageSlot;
    const hasOwnFrame = Boolean(frameUrl);

    const slotBorderRadius = slot
      ? `${(slot.radiusTopLeft ?? 0) * scale}px ${(slot.radiusTopRight ?? 0) * scale}px ${(slot.radiusBottomRight ?? 0) * scale}px ${(slot.radiusBottomLeft ?? 0) * scale}px`
      : undefined;

    // Máscara real (Container_Foto.png) tem prioridade sobre o raio de canto: recorta a foto
    // pixel a pixel pelo alfa da imagem, reproduzindo formas em degrau que raio de canto sozinho
    // não consegue (o design system do Sesi usa um recorte assim no canto superior-esquerdo).
    const maskStyle = maskUrl
      ? {
          WebkitMaskImage: `url(${maskUrl})`,
          maskImage: `url(${maskUrl})`,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
        }
      : { borderRadius: slotBorderRadius };

    const photoNode = imageUrl && slot && (
      <div
        style={{
          position: "absolute",
          left: `${slot.x}%`,
          top: `${slot.y}%`,
          width: `${slot.w}%`,
          height: `${slot.h}%`,
          overflow: "hidden",
          ...maskStyle,
        }}
      >
        <img src={imageUrl} alt="" crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        {/* Moldura própria por cima da foto: um box-shadow no MESMO elemento da <img> ficaria
            escondido atrás dela (o filho sempre pinta sobre o background/box-shadow do próprio
            pai), por isso é um overlay position:absolute separado, depois da foto na pintura. */}
        {hasOwnFrame && (
          <img src={frameUrl!} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill" }} />
        )}
      </div>
    );

    const backgroundNode = backgroundUrl && (
      <img
        src={backgroundUrl}
        alt=""
        crossOrigin="anonymous"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
    );

    return (
      <div
        ref={ref}
        style={{
          width: `${previewWidth}px`,
          height: `${height}px`,
          position: "relative",
          overflow: "hidden",
          backgroundColor: "#E5E7EB",
          fontFamily: spec.fontFamily || undefined,
        }}
      >
        {fontUrl && spec.fontFamily && (
          <style>{`@font-face{font-family:'${spec.fontFamily}';src:url('${fontUrl}');font-display:swap;}`}</style>
        )}

        {hasOwnFrame ? (
          <>
            {backgroundNode}
            {photoNode}
            {/* Stickers por cima da foto (não atrás): elementos como a palavra-chave "NR-01" são
                desenhados com o miolo vazado de propósito (contorno só), pra foto aparecer através
                da letra — atrás da foto, ficam simplesmente cobertos e somem (era o bug: "01"
                sumindo atrás da foto). */}
            {spec.stickers?.map((s) => {
              const url = stickerUrls?.[s.key];
              if (!url) return null;
              return (
                <img
                  key={s.key}
                  src={url}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%`, objectFit: "contain" }}
                />
              );
            })}
          </>
        ) : (
          <>
            {photoNode}
            {backgroundNode}
            {imageUrl && slot && slot.borderColor && (
              <div
                style={{
                  position: "absolute",
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                  width: `${slot.w}%`,
                  height: `${slot.h}%`,
                  borderRadius: slotBorderRadius,
                  boxShadow: `inset 0 0 0 ${(slot.borderWidth ?? 3) * scale}px ${slot.borderColor}`,
                  pointerEvents: "none",
                }}
              />
            )}
            {spec.stickers?.map((s) => {
              const url = stickerUrls?.[s.key];
              if (!url) return null;
              return (
                <img
                  key={s.key}
                  src={url}
                  alt=""
                  crossOrigin="anonymous"
                  style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%`, objectFit: "contain" }}
                />
              );
            })}
          </>
        )}

        {spec.fields.map((f) => (
          <div
            key={f.key}
            style={{
              position: "absolute",
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: `${f.w}%`,
              // sem altura fixa: o clamp abaixo limita o nº de linhas, mas a caixa
              // cresce até caber o texto — altura fixa + overflow hidden cortava
              // descendentes/partes das letras (ex.: "Sesi" cortada na headline). O
              // maxHeight é só uma rede de segurança pra um texto anormalmente longo
              // não vazar pra fora do canvas (corta a caixa toda, nunca no meio de uma letra).
              minHeight: `${f.h}%`,
              maxHeight: `${100 - f.y}%`,
              fontFamily: f.font || spec.fontFamily || "inherit",
              fontSize: `${Math.round((f.size ?? 32) * scale)}px`,
              color: f.color || "#111827",
              textAlign: f.align ?? "left",
              display: "-webkit-box",
              WebkitLineClamp: f.maxLines ?? 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              lineHeight: 1.1,
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
