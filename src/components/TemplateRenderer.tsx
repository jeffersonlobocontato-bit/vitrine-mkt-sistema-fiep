import { forwardRef, useEffect, useRef, useState } from "react";

/** Posição do "recorte" da foto dentro do slot — mesmo conceito de object-position do CSS
 * (0% = mostra a borda esquerda/superior da foto, 100% = mostra a direita/inferior), só que
 * exposto como um valor controlável de fora pra dar suporte ao arrasto tipo máscara do
 * Canva/Adobe (o quadro nunca muda de tamanho/posição, só qual pedaço da foto aparece nele). */
export interface ImagePosition {
  x: number;
  y: number;
  /** zoom da foto dentro do quadro (1 = preenche a moldura, "cover"). Sempre >= 1 pra que a
   * foto nunca deixe buraco dentro da máscara, igual às molduras do Canva. */
  zoom?: number;
}

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
  /** posição de empilhamento (maior = mais na frente) — definida arrastando no painel de
   * camadas do PresetEditor. Sem valor, cai no comportamento histórico (ver TemplateRenderer). */
  order?: number;
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
  /** posição de empilhamento da foto (maior = mais na frente) — mesmo mecanismo de `order`
   * de TemplateField/StickerAsset, ver painel de camadas do PresetEditor. */
  order?: number;
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
  /** posição de empilhamento (maior = mais na frente) — ver TemplateField.order. */
  order?: number;
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
  /** enquadramento atual da foto dentro do slot (object-position, 0-100% cada eixo) — sem
   * valor, cai no padrão centralizado (50/50), igual o comportamento de sempre. */
  imagePosition?: ImagePosition;
  /** presente = o slot de foto vira arrastável (like Canva/Adobe): o usuário arrasta a foto
   * por dentro do container fixo (posição/tamanho/máscara do slot nunca mudam) pra escolher
   * qual parte dela aparece. Ausente = a foto fica estática na posição de `imagePosition`
   * (usado no nó de exportação em resolução completa, que fica fora da tela). */
  onImagePositionChange?: (pos: ImagePosition) => void;
}

/**
 * Texto de um campo do preset, sempre DENTRO da caixa que o designer desenhou (mesmo x/y/w/h
 * do marcador do editor). Se o texto escrito pela IA não couber no tamanho de fonte
 * configurado, a fonte encolhe até caber (mínimo 45% do tamanho original) em vez de a caixa
 * crescer pra fora do marcador — era isso que fazia a arte final sair diferente do setup.
 */
const FittedText = ({
  field: f,
  text,
  scale,
  fallbackFamily,
}: {
  field: TemplateField;
  text: string;
  scale: number;
  fallbackFamily?: string;
}) => {
  const baseSize = Math.round((f.size ?? 32) * scale);
  const boxRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(baseSize);

  useEffect(() => {
    setFontSize(baseSize);
  }, [baseSize, text]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    // encolhe em passos pequenos até o conteúdo caber na caixa (ou até o piso de 45%)
    if (el.scrollHeight > el.clientHeight + 1 && fontSize > Math.max(8, baseSize * 0.45)) {
      setFontSize((s) => Math.max(Math.floor(baseSize * 0.45), s - Math.max(1, Math.round(baseSize * 0.04))));
    }
  }, [fontSize, baseSize, text]);

  return (
    <div
      ref={boxRef}
      style={{
        position: "absolute",
        left: `${f.x}%`,
        top: `${f.y}%`,
        width: `${f.w}%`,
        height: `${f.h}%`,
        fontFamily: f.font || fallbackFamily || "inherit",
        fontSize: `${fontSize}px`,
        color: f.color || "#111827",
        textAlign: f.align ?? "left",
        display: "-webkit-box",
        WebkitLineClamp: f.maxLines ?? 3,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        lineHeight: 1.12,
        fontWeight: 700,
      }}
    >
      {text}
    </div>
  );
};

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
  (
    { spec, values, backgroundUrl, imageUrl, frameUrl, maskUrl, stickerUrls, fontUrl, previewWidth = 1080, imagePosition, onImagePositionChange },
    ref,
  ) => {
    const scale = previewWidth / spec.width;
    const height = Math.round(spec.height * scale);
    const slot = spec.imageSlot;
    const hasOwnFrame = Boolean(frameUrl);

    // Arrasto da foto dentro do slot (máscara/moldura/posição do slot nunca mudam, só o
    // enquadramento): estado local só durante o gesto, a posição final vive fora (controlada
    // por imagePosition/onImagePositionChange) pra sobreviver entre a prévia pequena e o nó de
    // exportação em resolução completa, que compartilham o mesmo valor.
    const photoBoxRef = useRef<HTMLDivElement>(null);
    const [dragOrigin, setDragOrigin] = useState<{ clientX: number; clientY: number; pos: ImagePosition } | null>(null);
    const posX = imagePosition?.x ?? 50;
    const posY = imagePosition?.y ?? 50;
    const zoom = Math.max(1, imagePosition?.zoom ?? 1);

    useEffect(() => {
      if (!dragOrigin || !onImagePositionChange) return;
      const onMove = (e: MouseEvent) => {
        const rect = photoBoxRef.current?.getBoundingClientRect();
        if (!rect || !rect.width || !rect.height) return;
        const dxPct = ((e.clientX - dragOrigin.clientX) / rect.width) * 100;
        const dyPct = ((e.clientY - dragOrigin.clientY) / rect.height) * 100;
        // arrastar a foto pra direita/baixo revela mais do lado esquerdo/superior dela —
        // por isso o sinal invertido (é a foto que se move com o cursor, não a "janela").
        onImagePositionChange({
          x: Math.max(0, Math.min(100, dragOrigin.pos.x - dxPct)),
          y: Math.max(0, Math.min(100, dragOrigin.pos.y - dyPct)),
          zoom: dragOrigin.pos.zoom,
        });
      };
      const onUp = () => setDragOrigin(null);
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    }, [dragOrigin, onImagePositionChange]);

    const startDragPhoto = (e: React.MouseEvent) => {
      if (!onImagePositionChange) return;
      e.preventDefault();
      e.stopPropagation();
      setDragOrigin({ clientX: e.clientX, clientY: e.clientY, pos: { x: posX, y: posY, zoom } });
    };

    /** roda do mouse = zoom da foto dentro do quadro (mín. 1 = cover, máx. 4x) */
    const onWheelPhoto = (e: React.WheelEvent) => {
      if (!onImagePositionChange) return;
      e.preventDefault();
      e.stopPropagation();
      const next = Math.max(1, Math.min(4, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
      onImagePositionChange({ x: posX, y: posY, zoom: next });
    };

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
        ref={photoBoxRef}
        onMouseDown={startDragPhoto}
        style={{
          position: "absolute",
          left: `${slot.x}%`,
          top: `${slot.y}%`,
          width: `${slot.w}%`,
          height: `${slot.h}%`,
          overflow: "hidden",
          cursor: onImagePositionChange ? (dragOrigin ? "grabbing" : "grab") : undefined,
          ...maskStyle,
        }}
      >
        {/* O container (posição/tamanho/máscara) nunca se move — só o enquadramento da foto
            dentro dele, via object-position, exatamente como uma máscara de foto do
            Canva/Adobe: você arrasta a imagem por dentro de um quadro fixo. */}
        <img
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: `${posX}% ${posY}%`, pointerEvents: "none" }}
        />
        {/* Moldura própria por cima da foto: um box-shadow no MESMO elemento da <img> ficaria
            escondido atrás dela (o filho sempre pinta sobre o background/box-shadow do próprio
            pai), por isso é um overlay position:absolute separado, depois da foto na pintura. */}
        {hasOwnFrame && (
          <img src={frameUrl!} alt="" crossOrigin="anonymous" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "fill", pointerEvents: "none" }} />
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

    // Empilhamento unificado (foto + elementos gráficos + campos de texto), ordenável pelo
    // designer no painel de camadas do PresetEditor: maior `order` = mais na frente. Sem
    // `order` explícito em nada, cai no comportamento histórico — foto atrás, stickers na
    // ordem em que foram importados, campos de texto sempre por cima de tudo — pra não mudar
    // a aparência de um preset já pronto assim que o campo passa a existir.
    interface Layer {
      order: number;
      node: JSX.Element;
    }
    const stickerCount = spec.stickers?.length ?? 0;
    const overlayLayers: Layer[] = [];
    spec.stickers?.forEach((s, i) => {
      const url = stickerUrls?.[s.key];
      if (!url) return;
      overlayLayers.push({
        order: s.order ?? i + 1,
        node: (
          <img
            key={s.key}
            src={url}
            alt=""
            crossOrigin="anonymous"
            style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%`, objectFit: "contain" }}
          />
        ),
      });
    });
    spec.fields.forEach((f, i) => {
      overlayLayers.push({
        order: f.order ?? stickerCount + 1 + i,
        node: (
          <FittedText
            key={f.key}
            field={f}
            text={values[f.key] ?? ""}
            scale={scale}
            fallbackFamily={spec.fontFamily}
          />
        ),
      });
    });
    overlayLayers.sort((a, b) => a.order - b.order);
    // No modo com moldura própria, a foto entra no mesmo empilhamento (pode ficar atrás ou na
    // frente de um sticker, conforme o designer arrastou); no modo legado ela fica de fora
    // (ver comentário da árvore de composição abaixo) — a foto é renderizada fixa antes do fundo.
    const allLayers = photoNode
      ? [...overlayLayers, { order: slot?.order ?? 0, node: <div key="__image__">{photoNode}</div> }].sort((a, b) => a.order - b.order)
      : overlayLayers;

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
            {/* Foto, stickers e campos de texto entram todos no mesmo empilhamento — a ordem
                relativa entre eles é o que o designer define no painel de camadas (ex.: a
                palavra-chave "NR-01" é desenhada com o miolo vazado de propósito, pra foto
                aparecer através da letra quando o sticker fica na frente; atrás da foto, ela
                fica simplesmente coberta e some). */}
            {allLayers.map((l) => l.node)}
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
            {/* Modo legado: a foto fica presa atrás do fundo (ver árvore de composição no
                comentário do componente) e não entra no empilhamento reordenável — só stickers
                e campos de texto, entre si, respeitam a ordem do painel de camadas. */}
            {overlayLayers.map((l) => l.node)}
          </>
        )}
      </div>
    );
  },
);

TemplateRenderer.displayName = "TemplateRenderer";
