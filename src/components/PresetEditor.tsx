import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Trash2,
  Plus,
  Upload,
  Image as ImageIcon,
  Sparkle,
  ChevronDown,
  Grid3x3,
  GripVertical,
  ChevronUp,
  Type,
  Layers,
  Link2,
  Link2Off,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlertTriangle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { FormatTemplateSpec, StickerAsset, TemplateField } from "@/components/TemplateRenderer";

/** Uma alça de redimensionar: `dx`/`dy` dizem qual lado do elemento ela controla (-1 = lado
 * esquerdo/superior segue o cursor, o lado oposto fica fixo; +1 = lado direito/inferior segue,
 * esquerdo/superior fixo; 0 = esse eixo não muda). 8 alças = 4 cantos + 4 bordas, igual
 * Canva/Figma — antes só dava pra puxar do canto inferior direito. */
interface HandleDir {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}
const RESIZE_HANDLES: { dir: HandleDir; className: string; cursor: string }[] = [
  { dir: { dx: -1, dy: -1 }, className: "top-0 left-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-nwse-resize" },
  { dir: { dx: 0, dy: -1 }, className: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ns-resize" },
  { dir: { dx: 1, dy: -1 }, className: "top-0 right-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-nesw-resize" },
  { dir: { dx: 1, dy: 0 }, className: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
  { dir: { dx: 1, dy: 1 }, className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursor: "cursor-nwse-resize" },
  { dir: { dx: 0, dy: 1 }, className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "cursor-ns-resize" },
  { dir: { dx: -1, dy: 1 }, className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursor: "cursor-nesw-resize" },
  { dir: { dx: -1, dy: 0 }, className: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
];

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Redimensiona uma caixa a partir de UMA alça (canto ou borda) — o lado oposto ao que foi
 * puxado fica fixo (igual Adobe/Canva/Figma). Shift num canto trava a proporção original,
 * ancorada no canto oposto; alças de borda só mexem num eixo, então proporção não se aplica. */
const computeResize = (base: Box, dir: HandleDir, dxMouse: number, dyMouse: number, lockAspect: boolean): Box => {
  let { x, y, w, h } = base;
  if (dir.dx === 1) w = base.w + dxMouse;
  else if (dir.dx === -1) {
    x = base.x + dxMouse;
    w = base.w - dxMouse;
  }
  if (dir.dy === 1) h = base.h + dyMouse;
  else if (dir.dy === -1) {
    y = base.y + dyMouse;
    h = base.h - dyMouse;
  }
  if (lockAspect && dir.dx !== 0 && dir.dy !== 0 && base.w > 0 && base.h > 0) {
    const scale = Math.max(w / base.w, h / base.h);
    w = base.w * scale;
    h = w * (base.h / base.w);
    if (dir.dx === -1) x = base.x + base.w - w;
    if (dir.dy === -1) y = base.y + base.h - h;
  }
  return { x, y, w: Math.max(2, w), h: Math.max(2, h) };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Depois de redimensionar, garante que a caixa não vaze pra fora do canvas (0-100%) sem
 * quebrar o lado que ficou fixo — se o lado direito/inferior estourou, encolhe a largura/altura
 * em vez de mover o lado esquerdo/superior (e vice-versa). */
const clampBox = (b: Box, minSize: number): Box => {
  let { x, y, w, h } = b;
  w = Math.max(minSize, w);
  h = Math.max(minSize, h);
  x = clamp(x, 0, 100 - w);
  y = clamp(y, 0, 100 - h);
  w = Math.min(w, 100 - x);
  h = Math.min(h, 100 - y);
  return { x, y, w, h };
};

const SNAP_THRESHOLD = 1;

/** Linhas-guia candidatas pra encaixar (snap) um elemento sendo movido: bordas e centro do
 * canvas, mais bordas/centro de todo outro elemento (campo, sticker, slot de imagem) — igual
 * as guias magenta que aparecem ao arrastar algo no Canva/Figma. */
const collectGuideTargets = (spec: FormatTemplateSpec, excludeId: string) => {
  const xs = [0, 50, 100];
  const ys = [0, 50, 100];
  const boxes: Box[] = [
    ...spec.fields.filter((f) => `field:${f.key}` !== excludeId).map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })),
    ...(spec.stickers ?? []).filter((s) => `sticker:${s.key}` !== excludeId).map((s) => ({ x: s.x, y: s.y, w: s.w, h: s.h })),
    ...(spec.imageSlot && excludeId !== "image" ? [{ x: spec.imageSlot.x, y: spec.imageSlot.y, w: spec.imageSlot.w, h: spec.imageSlot.h }] : []),
  ];
  boxes.forEach((b) => {
    xs.push(b.x, b.x + b.w / 2, b.x + b.w);
    ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  });
  return { xs, ys };
};

/** Tenta encaixar a posição (x,y) de um elemento sendo movido num alvo próximo (borda/centro
 * do canvas ou de outro elemento) — compara a borda esquerda, o centro e a borda direita do
 * elemento contra cada alvo (mesma lógica nos dois eixos), e usa o encaixe mais próximo dentro
 * do limiar. Retorna também qual valor de guia bateu, pra desenhar a linha na tela. */
const snapMove = (
  spec: FormatTemplateSpec,
  excludeId: string,
  rawX: number,
  rawY: number,
  w: number,
  h: number,
): { x: number; y: number; guideX: number | null; guideY: number | null } => {
  const { xs: xTargets, ys: yTargets } = collectGuideTargets(spec, excludeId);
  let x = rawX;
  let guideX: number | null = null;
  let bestDx = SNAP_THRESHOLD;
  [rawX, rawX + w / 2, rawX + w].forEach((edge, i) => {
    xTargets.forEach((t) => {
      const d = Math.abs(edge - t);
      if (d < bestDx) {
        bestDx = d;
        guideX = t;
        x = rawX + (t - edge);
      }
    });
  });
  let y = rawY;
  let guideY: number | null = null;
  let bestDy = SNAP_THRESHOLD;
  [rawY, rawY + h / 2, rawY + h].forEach((edge) => {
    yTargets.forEach((t) => {
      const d = Math.abs(edge - t);
      if (d < bestDy) {
        bestDy = d;
        guideY = t;
        y = rawY + (t - edge);
      }
    });
  });
  return { x, y, guideX, guideY };
};

/** As 8 alças de redimensionar de um elemento selecionável — cantos + bordas, igual
 * Canva/Figma. `color` casa com a cor de borda já usada por cada tipo de elemento
 * (âmbar = campo, violeta = sticker, azul = slot de imagem). */
const ResizeHandles = ({ onResizeStart, color }: { onResizeStart: (e: React.MouseEvent, dir: HandleDir) => void; color: string }) => (
  <>
    {RESIZE_HANDLES.map(({ dir, className, cursor }) => (
      <div
        key={`${dir.dx}-${dir.dy}`}
        onMouseDown={(e) => onResizeStart(e, dir)}
        className={`absolute w-2.5 h-2.5 rounded-sm border border-white ${color} ${className} ${cursor}`}
      />
    ))}
  </>
);

/** Barra de alinhamento (esquerda/centro/direita, topo/centro/rodapé) — alinha o elemento em
 * relação às margens e ao centro do canvas, igual Canva/Figma. `box` é o w/h atual do elemento
 * (precisa pra calcular a posição centralizada e a margem oposta corretamente). */
const AlignToolbar = ({ box, onAlign }: { box: { w: number; h: number }; onAlign: (patch: { x?: number; y?: number }) => void }) => (
  <div className="flex items-center gap-1">
    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onAlign({ x: 0 })} title="Alinhar à margem esquerda">
      <AlignHorizontalJustifyStart className="w-3.5 h-3.5" />
    </Button>
    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onAlign({ x: 50 - box.w / 2 })} title="Centralizar horizontalmente">
      <AlignHorizontalJustifyCenter className="w-3.5 h-3.5" />
    </Button>
    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onAlign({ x: 100 - box.w })} title="Alinhar à margem direita">
      <AlignHorizontalJustifyEnd className="w-3.5 h-3.5" />
    </Button>
    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onAlign({ y: 0 })} title="Alinhar ao topo">
      <AlignVerticalJustifyStart className="w-3.5 h-3.5" />
    </Button>
    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onAlign({ y: 50 - box.h / 2 })} title="Centralizar verticalmente">
      <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
    </Button>
    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => onAlign({ y: 100 - box.h })} title="Alinhar ao rodapé">
      <AlignVerticalJustifyEnd className="w-3.5 h-3.5" />
    </Button>
  </div>
);

interface Props {
  referenceUrl: string;
  spec: FormatTemplateSpec;
  onChange: (spec: FormatTemplateSpec) => void;
  /** Chamado quando o designer usa "Novo elemento" → Marca/Grafismo — o upload em si
   * (storage + preset_reference_files) é responsabilidade de quem monta a tela de presets. */
  onUploadSticker?: (file: File) => void;
  /** Chamado quando o designer usa "Novo elemento" → Fonte de marca — cada formato tem sua
   * própria fonte (fontFamily/fontPath ficam no spec do formato ativo), então importar o
   * pacote só na aba Story, por exemplo, não aplica a fonte na aba Card automaticamente. */
  onUploadFont?: (file: File) => void;
  /** Chamado ao subir a máscara real do slot de imagem (silhueta preenchida, ex.:
   * Container_Foto.png) — recorta a foto pixel a pixel pelo alfa dela em vez de aproximar por
   * raio de canto. */
  onUploadMask?: (file: File) => void;
  /** Todo elemento gráfico já importado pro preset (fundo/moldura/máscara/sticker avulso), com
   * miniatura já resolvida — mostrado como uma coluna de miniaturas arrastáveis (igual Canva):
   * arrastar uma pra cima do card cria um sticker novo na posição soltada, sem precisar subir
   * o arquivo de novo nem digitar posição manualmente. */
  libraryAssets?: { path: string; name: string; url: string }[];
  /** Chamado ao soltar um elemento da biblioteca em cima do card — tenta recortar a margem
   * transparente ao redor do desenho (ver trimTransparentPadding em Presets.tsx) subindo um
   * arquivo novo, pra caixa de seleção/alinhamento do sticker ficar rente ao conteúdo visível
   * em vez de sobrar a margem do arquivo original (que pode ter sido exportado num canvas
   * maior, ex.: uma máscara recortada do card inteiro). Sem essa prop, ou se não achar margem
   * significativa, o sticker usa o arquivo original sem recorte. */
  onTrimLibraryAsset?: (url: string) => Promise<{ path: string; width: number; height: number } | null>;
}

let fieldCounter = 0;

/** Ponto de partida de cada tipo comum de elemento — evita desenhar do zero e já cria a
 * caixa no lugar certo pra receber, por exemplo, um card de referência sem CTA: o designer
 * adiciona o CTA aqui, e quando o usuário final pedir um telefone no chat da geração, já tem
 * onde entrar (campo dataBound), em vez de não ter posição nenhuma reservada para ele. */
const QUICK_FIELDS: Record<"headline" | "subtitulo" | "cta", Omit<TemplateField, "key">> = {
  headline: { label: "Headline", x: 8, y: 10, w: 80, h: 18, size: 64, color: "#111827", align: "left", maxLines: 2 },
  subtitulo: { label: "Subtítulo", x: 8, y: 30, w: 70, h: 10, size: 36, color: "#111827", align: "left", maxLines: 2 },
  cta: { label: "Contato (CTA)", x: 8, y: 90, w: 84, h: 7, size: 26, color: "#FFFFFF", align: "left", maxLines: 1, dataBound: true },
};

// CSS px de referência = 1/96". Sem um DPI declarado no preset, é a conversão mm->px mais
// padrão pra uma arte pensada pra tela (não impressão) — ajustar aqui se o pacote de design
// for pensado em outra resolução de exportação.
const PX_PER_MM = 96 / 25.4;
const GRID_MM = 5;

/** Item do painel de camadas — um por foto/sticker/campo de texto, ver `layerItems` abaixo. */
interface LayerItem {
  id: string;
  kind: "image" | "sticker" | "field";
  label: string;
  order: number;
  thumb?: string;
}

/**
 * Controle de tamanho em pixels (na resolução de referência do formato, ex.: 1080×1440),
 * com cadeado de proporção — igual ao painel de transformação do Adobe/Figma (W:/H: com um
 * ícone de corrente no meio). Cadeado fechado (padrão): mudar W recalcula H (e vice-versa)
 * mantendo a proporção atual; cadeado aberto: cada eixo estica livre, independente.
 */
const PixelSizeInputs = ({
  wPercent,
  hPercent,
  canvasWidth,
  canvasHeight,
  onChange,
}: {
  wPercent: number;
  hPercent: number;
  canvasWidth: number;
  canvasHeight: number;
  onChange: (next: { w: number; h: number }) => void;
}) => {
  const [locked, setLocked] = useState(true);
  const wPx = Math.round((wPercent / 100) * canvasWidth);
  const hPx = Math.round((hPercent / 100) * canvasHeight);

  const setWPx = (nextWPx: number) => {
    if (!Number.isFinite(nextWPx) || nextWPx <= 0) return;
    const nextHPx = locked && wPx > 0 ? nextWPx * (hPx / wPx) : hPx;
    onChange({ w: (nextWPx / canvasWidth) * 100, h: (nextHPx / canvasHeight) * 100 });
  };
  const setHPx = (nextHPx: number) => {
    if (!Number.isFinite(nextHPx) || nextHPx <= 0) return;
    const nextWPx = locked && hPx > 0 ? nextHPx * (wPx / hPx) : wPx;
    onChange({ w: (nextWPx / canvasWidth) * 100, h: (nextHPx / canvasHeight) * 100 });
  };

  return (
    <div className="flex items-end gap-1.5">
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">W: px</Label>
        <Input type="number" className="h-8 w-20" value={wPx} onChange={(e) => setWPx(Number(e.target.value))} />
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
        onClick={() => setLocked((v) => !v)}
        title={locked ? "Proporção travada — clique pra destravar" : "Proporção livre — clique pra travar"}
      >
        {locked ? <Link2 className="w-4 h-4" /> : <Link2Off className="w-4 h-4 text-muted-foreground" />}
      </Button>
      <div className="space-y-0.5">
        <Label className="text-[10px] text-muted-foreground">H: px</Label>
        <Input type="number" className="h-8 w-20" value={hPx} onChange={(e) => setHPx(Number(e.target.value))} />
      </div>
    </div>
  );
};

/**
 * Caixa recolhível pra lateral do editor não virar uma rolagem infinita — cada seção
 * (camadas, slot de imagem, campo selecionado, stickers...) abre/fecha independente, estado
 * não controlado (cada instância guarda o próprio aberto/fechado). `actions` fica sempre
 * visível no cabeçalho (ex.: botão de excluir), mesmo com a seção recolhida.
 */
const CollapsibleCard = ({
  title,
  icon,
  actions,
  defaultOpen = true,
  children,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs font-medium min-w-0">
            {icon}
            <span className="truncate">{title}</span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {actions}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setOpen((v) => !v)}
              title={open ? "Recolher" : "Expandir"}
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            </Button>
          </div>
        </div>
        {open && <div className="space-y-2">{children}</div>}
      </CardContent>
    </Card>
  );
};

/**
 * Editor visual do preset: o designer desenha retângulos sobre a arte de
 * referência (exportada do Adobe) para definir cada campo de texto e o slot
 * de imagem. Isso vira o template_spec que o TemplateRenderer usa depois — a
 * IA nunca decide layout, só preenche o que já foi desenhado aqui.
 */
export const PresetEditor = ({ referenceUrl, spec, onChange, onUploadSticker, onUploadFont, onUploadMask, libraryAssets, onTrimLibraryAsset }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedStickerKey, setSelectedStickerKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<
    | { kind: "field"; key: string; mode: "move"; startX: number; startY: number; field: TemplateField }
    | { kind: "field"; key: string; mode: "resize"; dir: HandleDir; startX: number; startY: number; field: TemplateField }
    | { kind: "sticker"; key: string; mode: "move"; startX: number; startY: number; sticker: StickerAsset }
    | { kind: "sticker"; key: string; mode: "resize"; dir: HandleDir; startX: number; startY: number; sticker: StickerAsset }
    | { kind: "slot"; mode: "move"; startX: number; startY: number; slot: NonNullable<FormatTemplateSpec["imageSlot"]> }
    | { kind: "slot"; mode: "resize"; dir: HandleDir; startX: number; startY: number; slot: NonNullable<FormatTemplateSpec["imageSlot"]> }
    | null
  >(null);
  // Signed URLs das imagens de sticker pra exibir o elemento direto no grid (o bucket é privado).
  const [stickerUrls, setStickerUrls] = useState<Record<string, string>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  // A arte de referência serve só de base pra posicionar os elementos — o fundo
  // real do criativo vem dos backgrounds do preset. Esse toggle esconde a
  // referência pra conferir o resultado sem ela atrapalhar a leitura.
  const [showReference, setShowReference] = useState(true);
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  // Linhas-guia de encaixe (snap) ativas durante um arrasto de mover — igual Canva/Figma.
  const [snapGuides, setSnapGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  // Seleção múltipla (Shift+clique em vários elementos) — só existe pra alinhar um elemento em
  // relação aos outros selecionados (alinhar contra o canvas já é o painel de alinhamento comum
  // de um elemento só). IDs no mesmo formato do painel de camadas: "image", "field:<key>",
  // "sticker:<key>". Enquanto tiver 2+ elementos aqui, os painéis de propriedade de um elemento
  // só (Campo selecionado etc.) ficam escondidos — o painel de alinhar-entre-si assume o lugar.
  const [multiSelectKeys, setMultiSelectKeys] = useState<Set<string>>(new Set());

  // Desfazer/refazer: pilha de estados anteriores do spec. `gestureBaseRef` guarda o estado
  // de ANTES do gesto em andamento (só grava no histórico quando o gesto termina), pra um
  // arrasto inteiro (várias mudanças por segundo) virar UM passo de undo, não centenas.
  const [history, setHistory] = useState<{ past: FormatTemplateSpec[]; future: FormatTemplateSpec[] }>({ past: [], future: [] });
  const specRef = useRef(spec);
  specRef.current = spec;
  const gestureBaseRef = useRef<FormatTemplateSpec | null>(null);

  /** Aplica a mudança sem mexer no histórico — usado só durante o arrasto contínuo (mousemove),
   * cujo início já foi capturado em `gestureBaseRef`. */
  const applySpec = (next: FormatTemplateSpec) => onChange(next);

  /** Fecha o gesto atual: grava o estado de antes no histórico (se algo mudou) e limpa o
   * "future" (refazer só faz sentido logo depois de um undo, não depois de uma edição nova). */
  const flushHistory = () => {
    const base = gestureBaseRef.current;
    gestureBaseRef.current = null;
    if (base) setHistory((h) => ({ past: [...h.past.slice(-49), base], future: [] }));
  };

  /** Mudança de um clique/digitação só (não-arrasto): cada chamada vira seu próprio passo de
   * undo — captura o estado antes de aplicar, aplica, e já fecha o gesto na hora. */
  const commitSpec = (next: FormatTemplateSpec) => {
    if (gestureBaseRef.current === null) gestureBaseRef.current = specRef.current;
    applySpec(next);
    flushHistory();
  };

  const undo = () => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      applySpec(previous);
      return { past: h.past.slice(0, -1), future: [specRef.current, ...h.future].slice(0, 50) };
    });
  };
  const redo = () => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const nextSpec = h.future[0];
      applySpec(nextSpec);
      return { past: [...h.past, specRef.current].slice(-50), future: h.future.slice(1) };
    });
  };

  const pct = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)),
    };
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target !== containerRef.current && !(e.target as HTMLElement).dataset.canvasBg) return;
    const p = pct(e.clientX, e.clientY);
    setDrawing({ x0: p.x, y0: p.y, x: p.x, y: p.y });
    setSelected(null);
    setSelectedStickerKey(null);
    setMultiSelectKeys(new Set());
  };

  // Versões "cruas" dos mutadores — chamadas só durante o arrasto contínuo (mousemove), sem
  // mexer no histórico a cada pixel (o gesto inteiro vira um passo de undo só, fechado no
  // mouseup por flushHistory). As versões usadas pelos campos numéricos da lateral (mais
  // abaixo) já commitam cada mudança na hora.
  const updateFieldDrag = (key: string, fn: (f: TemplateField) => TemplateField) => {
    applySpec({ ...spec, fields: spec.fields.map((f) => (f.key === key ? fn(f) : f)) });
  };
  const updateStickerDrag = (key: string, patch: Partial<StickerAsset>) => {
    applySpec({ ...spec, stickers: (spec.stickers ?? []).map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  };
  const updateImageSlotDrag = (patch: Partial<FormatTemplateSpec["imageSlot"]>) => {
    if (!spec.imageSlot) return;
    applySpec({ ...spec, imageSlot: { ...spec.imageSlot, ...patch } });
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (drawing) {
      const p = pct(e.clientX, e.clientY);
      setDrawing({ ...drawing, x: p.x, y: p.y });
    } else if (drag) {
      const p = pct(e.clientX, e.clientY);
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      if (drag.kind === "field") {
        const f0 = drag.field;
        if (drag.mode === "move") {
          const raw = { x: f0.x + dx, y: f0.y + dy, w: f0.w, h: f0.h };
          const snapped = snapMove(spec, `field:${drag.key}`, raw.x, raw.y, raw.w, raw.h);
          setSnapGuides({ x: snapped.guideX, y: snapped.guideY });
          const box = clampBox({ ...raw, x: snapped.x, y: snapped.y }, 2);
          updateFieldDrag(drag.key, (f) => ({ ...f, x: box.x, y: box.y }));
        } else {
          const box = clampBox(computeResize(f0, drag.dir, dx, dy, e.shiftKey), 4);
          updateFieldDrag(drag.key, (f) => ({ ...f, ...box }));
        }
      } else if (drag.kind === "slot") {
        const s0 = drag.slot;
        if (drag.mode === "move") {
          const raw = { x: s0.x + dx, y: s0.y + dy, w: s0.w, h: s0.h };
          const snapped = snapMove(spec, "image", raw.x, raw.y, raw.w, raw.h);
          setSnapGuides({ x: snapped.guideX, y: snapped.guideY });
          const box = clampBox({ ...raw, x: snapped.x, y: snapped.y }, 4);
          updateImageSlotDrag({ x: box.x, y: box.y });
        } else {
          const box = clampBox(computeResize(s0, drag.dir, dx, dy, e.shiftKey), 4);
          updateImageSlotDrag(box);
        }
      } else {
        const s0 = drag.sticker;
        if (drag.mode === "move") {
          const raw = { x: s0.x + dx, y: s0.y + dy, w: s0.w, h: s0.h };
          const snapped = snapMove(spec, `sticker:${drag.key}`, raw.x, raw.y, raw.w, raw.h);
          setSnapGuides({ x: snapped.guideX, y: snapped.guideY });
          const box = clampBox({ ...raw, x: snapped.x, y: snapped.y }, 2);
          updateStickerDrag(drag.key, { x: box.x, y: box.y });
        } else {
          const box = clampBox(computeResize(s0, drag.dir, dx, dy, e.shiftKey), 2);
          updateStickerDrag(drag.key, box);
        }
      }
    }
  };

  const onCanvasMouseUp = () => {
    if (drawing) {
      const x = Math.min(drawing.x0, drawing.x);
      const y = Math.min(drawing.y0, drawing.y);
      const w = Math.abs(drawing.x - drawing.x0);
      const h = Math.abs(drawing.y - drawing.y0);
      if (w > 2 && h > 2) {
        fieldCounter += 1;
        const key = `campo_${fieldCounter}`;
        const field: TemplateField = { key, label: `Campo ${fieldCounter}`, x, y, w, h, size: 32, color: "#111827", align: "left", maxLines: 3 };
        commitSpec({ ...spec, fields: [...spec.fields, field] });
        setSelected(key);
      }
      setDrawing(null);
    }
    setDrag(null);
    setSnapGuides({ x: null, y: null });
    flushHistory();
  };

  const updateField = (key: string, fn: (f: TemplateField) => TemplateField) => {
    commitSpec({ ...spec, fields: spec.fields.map((f) => (f.key === key ? fn(f) : f)) });
  };

  const removeField = (key: string) => {
    commitSpec({ ...spec, fields: spec.fields.filter((f) => f.key !== key) });
    if (selected === key) setSelected(null);
    setMultiSelectKeys((prev) => {
      if (!prev.has(`field:${key}`)) return prev;
      const next = new Set(prev);
      next.delete(`field:${key}`);
      return next;
    });
  };

  /** Resolve o box atual (x/y/w/h) de um id do jeito "image" / "field:<key>" / "sticker:<key>"
   * — mesmo formato usado no painel de camadas — pra calcular a caixa combinada da seleção
   * múltipla e aplicar o alinhamento. */
  const idKeyPart = (id: string) => id.slice(id.indexOf(":") + 1);
  const getBoxForId = (id: string): Box | null => {
    if (id === "image") return spec.imageSlot ? { x: spec.imageSlot.x, y: spec.imageSlot.y, w: spec.imageSlot.w, h: spec.imageSlot.h } : null;
    if (id.startsWith("field:")) {
      const f = spec.fields.find((x) => x.key === idKeyPart(id));
      return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : null;
    }
    const s = (spec.stickers ?? []).find((x) => x.key === idKeyPart(id));
    return s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null;
  };

  /** Shift+clique no corpo de um elemento (não nas alças de redimensionar) alterna ele dentro
   * da seleção múltipla, sem iniciar arrasto — igual Canva/Figma: clica no primeiro, segura
   * Shift e clica nos demais que quer alinhar entre si. Sem seleção múltipla ainda, começa uma
   * nova incluindo o que já estava selecionado sozinho (se houver). */
  const toggleMultiSelect = (id: string) => {
    setMultiSelectKeys((prev) => {
      const next = new Set(prev);
      if (next.size === 0) {
        const currentSingle = selected ? `field:${selected}` : selectedStickerKey ? `sticker:${selectedStickerKey}` : null;
        if (currentSingle && currentSingle !== id) next.add(currentSingle);
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelected(null);
    setSelectedStickerKey(null);
  };

  const startDragFieldMove = (e: React.MouseEvent, field: TemplateField) => {
    e.stopPropagation();
    if (e.shiftKey) return toggleMultiSelect(`field:${field.key}`);
    setMultiSelectKeys(new Set());
    setSelected(field.key);
    setSelectedStickerKey(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "field", key: field.key, mode: "move", startX: p.x, startY: p.y, field });
  };
  const startResizeField = (e: React.MouseEvent, field: TemplateField, dir: HandleDir) => {
    e.stopPropagation();
    setMultiSelectKeys(new Set());
    setSelected(field.key);
    setSelectedStickerKey(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "field", key: field.key, mode: "resize", dir, startX: p.x, startY: p.y, field });
  };

  const startDragStickerMove = (e: React.MouseEvent, sticker: StickerAsset) => {
    e.stopPropagation();
    if (e.shiftKey) return toggleMultiSelect(`sticker:${sticker.key}`);
    setMultiSelectKeys(new Set());
    setSelectedStickerKey(sticker.key);
    setSelected(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "sticker", key: sticker.key, mode: "move", startX: p.x, startY: p.y, sticker });
  };
  const startResizeSticker = (e: React.MouseEvent, sticker: StickerAsset, dir: HandleDir) => {
    e.stopPropagation();
    setMultiSelectKeys(new Set());
    setSelectedStickerKey(sticker.key);
    setSelected(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "sticker", key: sticker.key, mode: "resize", dir, startX: p.x, startY: p.y, sticker });
  };

  // Container da foto: mesmo arraste dos demais elementos — antes só dava pra posicionar
  // digitando números nos campos do painel.
  const startDragSlotMove = (e: React.MouseEvent, slot: NonNullable<FormatTemplateSpec["imageSlot"]>) => {
    e.stopPropagation();
    if (e.shiftKey) return toggleMultiSelect("image");
    setMultiSelectKeys(new Set());
    setSelected(null);
    setSelectedStickerKey(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "slot", mode: "move", startX: p.x, startY: p.y, slot });
  };
  const startResizeSlot = (e: React.MouseEvent, slot: NonNullable<FormatTemplateSpec["imageSlot"]>, dir: HandleDir) => {
    e.stopPropagation();
    setMultiSelectKeys(new Set());
    setSelected(null);
    setSelectedStickerKey(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "slot", mode: "resize", dir, startX: p.x, startY: p.y, slot });
  };

  const addImageSlot = () => {
    commitSpec({ ...spec, imageSlot: { x: 10, y: 10, w: 80, h: 40 } });
  };

  const updateImageSlot = (patch: Partial<FormatTemplateSpec["imageSlot"]>) => {
    if (!spec.imageSlot) return;
    commitSpec({ ...spec, imageSlot: { ...spec.imageSlot, ...patch } });
  };

  const addQuickField = (type: keyof typeof QUICK_FIELDS) => {
    fieldCounter += 1;
    const field: TemplateField = { ...QUICK_FIELDS[type], key: `${type}_${fieldCounter}` };
    commitSpec({ ...spec, fields: [...spec.fields, field] });
    setSelected(field.key);
    setShowAddMenu(false);
  };

  const requestStickerUpload = () => {
    setShowAddMenu(false);
    stickerInputRef.current?.click();
  };

  const requestFontUpload = () => {
    setShowAddMenu(false);
    fontInputRef.current?.click();
  };

  const updateSticker = (key: string, patch: Partial<StickerAsset>) => {
    commitSpec({ ...spec, stickers: (spec.stickers ?? []).map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  };

  const removeSticker = (key: string) => {
    commitSpec({ ...spec, stickers: (spec.stickers ?? []).filter((s) => s.key !== key) });
    setMultiSelectKeys((prev) => {
      if (!prev.has(`sticker:${key}`)) return prev;
      const next = new Set(prev);
      next.delete(`sticker:${key}`);
      return next;
    });
  };

  // Caixa combinada de toda a seleção múltipla (menor x/y, maior x+w/y+h entre os elementos
  // marcados) — é em relação a ESSA caixa que "alinhar à esquerda", "centralizar" etc. fazem
  // sentido quando há 2+ elementos selecionados (alinhar um em relação aos outros, não ao
  // canvas inteiro, que é o que o painel de alinhamento de um elemento só já faz).
  const multiSelectBoxes = [...multiSelectKeys]
    .map((id) => ({ id, box: getBoxForId(id) }))
    .filter((e): e is { id: string; box: Box } => e.box !== null);
  const groupBox: Box | null =
    multiSelectBoxes.length >= 2
      ? multiSelectBoxes.reduce<Box>((acc, { box }, i) => {
          if (i === 0) return box;
          const x = Math.min(acc.x, box.x);
          const y = Math.min(acc.y, box.y);
          const right = Math.max(acc.x + acc.w, box.x + box.w);
          const bottom = Math.max(acc.y + acc.h, box.y + box.h);
          return { x, y, w: right - x, h: bottom - y };
        }, multiSelectBoxes[0].box)
      : null;

  /** Aplica `patchFor(caixaDoElemento, caixaDoGrupo)` a cada elemento da seleção múltipla, tudo
   * numa única chamada de commitSpec — um passo de undo só pra ação inteira, não um por elemento. */
  const alignGroup = (patchFor: (box: Box, group: Box) => Partial<Box>) => {
    if (!groupBox) return;
    let next = spec;
    multiSelectBoxes.forEach(({ id, box }) => {
      const patch = patchFor(box, groupBox);
      if (id === "image" && next.imageSlot) {
        next = { ...next, imageSlot: { ...next.imageSlot, ...patch } };
      } else if (id.startsWith("field:")) {
        const key = idKeyPart(id);
        next = { ...next, fields: next.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) };
      } else if (id.startsWith("sticker:")) {
        const key = idKeyPart(id);
        next = { ...next, stickers: (next.stickers ?? []).map((s) => (s.key === key ? { ...s, ...patch } : s)) };
      }
    });
    commitSpec(next);
  };

  /** Solto da biblioteca de miniaturas em cima do card (ver `libraryAssets`): cria um sticker
   * novo já centralizado no ponto onde foi arrastado. Antes de posicionar, tenta recortar a
   * margem transparente do arquivo original (via `onTrimLibraryAsset` — ver Presets.tsx) pra
   * caixa do sticker nascer rente ao desenho, não à margem de um arquivo que pode ter sido
   * exportado num canvas maior (ex.: uma máscara recortada do card inteiro) — sem isso, a
   * caixa de seleção/alinhamento sobra maior que a forma visível. */
  const addStickerFromLibrary = async (path: string, url: string, xPercent: number, yPercent: number) => {
    const trimmed = onTrimLibraryAsset ? await onTrimLibraryAsset(url).catch(() => null) : null;
    const finalPath = trimmed?.path ?? path;
    const aspect = trimmed && trimmed.height > 0 ? trimmed.width / trimmed.height : 1;

    const filename = finalPath.split("/").pop() ?? finalPath;
    const baseKey =
      filename
        .replace(/^(?:pack|sticker|mask|font|componente)-[0-9a-fA-F-]{36}-/, "")
        .replace(/\.[^.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_") || "elemento";
    const existing = new Set((spec.stickers ?? []).map((s) => s.key));
    let key = baseKey;
    let n = 1;
    while (existing.has(key)) {
      n += 1;
      key = `${baseKey}_${n}`;
    }
    const w = 20;
    const h = clamp(aspect > 0 ? w / aspect : 20, 4, 60);
    const sticker: StickerAsset = {
      key,
      path: finalPath,
      x: Math.max(0, Math.min(100 - w, xPercent - w / 2)),
      y: Math.max(0, Math.min(100 - h, yPercent - h / 2)),
      w,
      h,
    };
    commitSpec({ ...spec, stickers: [...(spec.stickers ?? []), sticker] });
    setSelected(null);
    setSelectedStickerKey(key);
  };

  // Atalhos de teclado: Ctrl/Cmd+Z desfaz, Ctrl/Cmd+Shift+Z (ou +Y) refaz, setas movem o
  // elemento selecionado em passos pequenos (Shift = passo maior) — igual Canva/Figma. Ignora
  // tudo isso quando o foco está num campo de texto/número da lateral (não deveria interceptar
  // o cursor de texto nem o das setas dentro de um <input>).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y" && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (typing) return;
      if (e.key === "Escape" && multiSelectKeys.size > 0) {
        setMultiSelectKeys(new Set());
        return;
      }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      if (!selected && !selectedStickerKey) return;
      e.preventDefault();
      const step = e.shiftKey ? 1 : 0.2;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (selected) {
        const f = spec.fields.find((x) => x.key === selected);
        if (!f) return;
        commitSpec({
          ...spec,
          fields: spec.fields.map((x) => (x.key === selected ? { ...x, x: clamp(x.x + dx, 0, 100 - x.w), y: clamp(x.y + dy, 0, 100 - x.h) } : x)),
        });
      } else if (selectedStickerKey) {
        const s = spec.stickers?.find((x) => x.key === selectedStickerKey);
        if (!s) return;
        commitSpec({
          ...spec,
          stickers: (spec.stickers ?? []).map((x) => (x.key === selectedStickerKey ? { ...x, x: clamp(x.x + dx, 0, 100 - x.w), y: clamp(x.y + dy, 0, 100 - x.h) } : x)),
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedStickerKey, spec, multiSelectKeys]);

  // Resolve signed URLs dos stickers pra mostrar a imagem real no grid.
  useEffect(() => {
    const stickers = spec.stickers ?? [];
    if (stickers.length === 0) {
      setStickerUrls({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        stickers.map(async (s) => {
          const { data } = await supabase.storage.from("preset-assets").createSignedUrl(s.path, 3600);
          return [s.key, data?.signedUrl ?? ""] as const;
        }),
      );
      if (!cancelled) setStickerUrls(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [spec.stickers]);

  const selectedField = spec.fields.find((f) => f.key === selected);
  const gridPercentX = ((GRID_MM * PX_PER_MM) / spec.width) * 100;
  const gridPercentY = ((GRID_MM * PX_PER_MM) / spec.height) * 100;

  // Painel de camadas: mesma lógica de "maior order = mais na frente" que o TemplateRenderer usa
  // pra desenhar (ver TemplateField.order/StickerAsset.order/ImageSlot.order) — aqui só listamos
  // pra deixar o designer arrastar, igual Adobe (topo da lista = elemento mais na frente).
  const stickerCountForOrder = spec.stickers?.length ?? 0;
  const layerItems: LayerItem[] = [
    ...(spec.imageSlot
      ? [{ id: "image", kind: "image" as const, label: "Foto", order: spec.imageSlot.order ?? 0 }]
      : []),
    ...(spec.stickers ?? []).map((s, i) => ({
      id: `sticker:${s.key}`,
      kind: "sticker" as const,
      label: s.key,
      order: s.order ?? i + 1,
      thumb: stickerUrls[s.key],
    })),
    ...spec.fields.map((f, i) => ({
      id: `field:${f.key}`,
      kind: "field" as const,
      label: f.label,
      order: f.order ?? stickerCountForOrder + 1 + i,
    })),
  ].sort((a, b) => b.order - a.order);

  // Reescreve o `order` de tudo (foto/stickers/campos) a partir da ordem visual do painel —
  // topo da lista (índice 0) vira o maior order, base vira 0. Reatribuir sempre em sequência
  // limpa evita colisão/deriva de valores em vez de só trocar dois números de lugar.
  const applyLayerOrder = (ordered: LayerItem[]) => {
    const n = ordered.length;
    const orderById = new Map(ordered.map((item, idx) => [item.id, n - 1 - idx]));
    commitSpec({
      ...spec,
      fields: spec.fields.map((f) => ({ ...f, order: orderById.get(`field:${f.key}`) ?? f.order })),
      stickers: (spec.stickers ?? []).map((s) => ({ ...s, order: orderById.get(`sticker:${s.key}`) ?? s.order })),
      imageSlot: spec.imageSlot ? { ...spec.imageSlot, order: orderById.get("image") ?? spec.imageSlot.order } : spec.imageSlot,
    });
  };

  const moveLayer = (id: string, direction: "up" | "down") => {
    const idx = layerItems.findIndex((l) => l.id === id);
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || targetIdx < 0 || targetIdx >= layerItems.length) return;
    const ordered = [...layerItems];
    [ordered[idx], ordered[targetIdx]] = [ordered[targetIdx], ordered[idx]];
    applyLayerOrder(ordered);
  };

  const selectLayer = (item: LayerItem) => {
    if (item.kind === "field") {
      setSelected(item.id.slice("field:".length));
      setSelectedStickerKey(null);
    } else if (item.kind === "sticker") {
      setSelectedStickerKey(item.id.slice("sticker:".length));
      setSelected(null);
    } else {
      setSelected(null);
      setSelectedStickerKey(null);
    }
  };

  const handleLayerDrop = (targetId: string) => {
    if (!dragLayerId || dragLayerId === targetId) {
      setDragLayerId(null);
      return;
    }
    const ordered = [...layerItems];
    const fromIdx = ordered.findIndex((l) => l.id === dragLayerId);
    const toIdx = ordered.findIndex((l) => l.id === targetId);
    if (fromIdx !== -1 && toIdx !== -1) {
      const [moved] = ordered.splice(fromIdx, 1);
      ordered.splice(toIdx, 0, moved);
      applyLayerOrder(ordered);
    }
    setDragLayerId(null);
  };

  const isLayerSelected = (item: LayerItem) =>
    (item.kind === "field" && selected === item.id.slice("field:".length)) ||
    (item.kind === "sticker" && selectedStickerKey === item.id.slice("sticker:".length));

  const hasLibrary = (libraryAssets?.length ?? 0) > 0;

  return (
    <div className={`grid gap-4 ${hasLibrary ? "lg:grid-cols-[132px_1fr_320px]" : "lg:grid-cols-[1fr_320px]"}`}>
      {hasLibrary && (
        <div className="space-y-2 lg:max-h-[70vh] lg:overflow-y-auto">
          <Label className="text-xs font-medium">Biblioteca</Label>
          <p className="text-[10px] text-muted-foreground">Arraste um elemento pra cima do card.</p>
          <div className="space-y-2">
            {libraryAssets!.map((asset) => (
              <div
                key={asset.path}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", JSON.stringify({ path: asset.path, url: asset.url }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                title="Arraste pra cima do card"
                className="border border-border rounded-md p-1.5 space-y-1 bg-background hover:border-primary/50 cursor-grab active:cursor-grabbing"
              >
                <div className="aspect-square rounded bg-muted/40 flex items-center justify-center overflow-hidden">
                  <img src={asset.url} alt="" className="max-w-full max-h-full object-contain pointer-events-none" draggable={false} />
                </div>
                <p className="text-[10px] text-center leading-tight truncate" title={asset.name}>
                  {asset.name}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant={showGrid ? "default" : "outline"} onClick={() => setShowGrid((v) => !v)}>
            <Grid3x3 className="w-4 h-4 mr-1" /> Grade (5mm)
          </Button>
          <Button
            size="sm"
            variant={showReference ? "default" : "outline"}
            onClick={() => setShowReference((v) => !v)}
            title="A arte de referência serve apenas para posicionar os elementos — ela não é o fundo do criativo gerado"
          >
            {showReference ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
            Referência {showReference ? "visível" : "oculta"}
          </Button>
          <div className="flex items-center gap-1 border-l border-border pl-2 ml-1">
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={undo} disabled={history.past.length === 0} title="Desfazer (Ctrl+Z)">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8" onClick={redo} disabled={history.future.length === 0} title="Refazer (Ctrl+Shift+Z)">
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div
          ref={containerRef}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("text/plain")) e.preventDefault();
          }}
          onDrop={(e) => {
            const raw = e.dataTransfer.getData("text/plain");
            if (!raw) return;
            e.preventDefault();
            const p = pct(e.clientX, e.clientY);
            try {
              const { path, url } = JSON.parse(raw) as { path: string; url: string };
              void addStickerFromLibrary(path, url, p.x, p.y);
            } catch {
              // formato antigo/inesperado (só o path) — não trava o drop, só não recorta.
              void addStickerFromLibrary(raw, "", p.x, p.y);
            }
          }}
          className="relative border border-border rounded-lg overflow-hidden select-none cursor-crosshair"
          style={{ aspectRatio: `${spec.width} / ${spec.height}`, maxHeight: "70vh" }}
        >
          {showReference && (
            <img data-canvas-bg src={referenceUrl} alt="Referência" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />
          )}

          {showGrid && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(255,60,60,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,60,60,0.4) 1px, transparent 1px)",
                backgroundSize: `${gridPercentX}% ${gridPercentY}%`,
              }}
            />
          )}

        {/* Mesma lógica de empilhamento do TemplateRenderer: foto, stickers e campos entram
            num único conjunto ordenado pelo `order` do painel de camadas (maior = mais na
            frente). Assim, mudar a ordem no painel muda o preview na hora — sem isso, os
            elementos eram desenhados numa ordem fixa (foto → campos → stickers) e o painel
            de camadas não tinha efeito visual nenhum. */}
        {(() => {
          const layers: { order: number; node: JSX.Element }[] = [];
          if (spec.imageSlot) {
            layers.push({
              order: spec.imageSlot.order ?? 0,
              node: (
                <div
                  key="__image__"
                  onMouseDown={(e) => startDragSlotMove(e, spec.imageSlot!)}
                  className={`absolute border-2 ${multiSelectKeys.has("image") ? "border-amber-500" : "border-blue-400"} bg-blue-400/10 flex items-center justify-center text-xs text-blue-700 font-medium cursor-move`}
                  style={{ left: `${spec.imageSlot.x}%`, top: `${spec.imageSlot.y}%`, width: `${spec.imageSlot.w}%`, height: `${spec.imageSlot.h}%` }}
                >
                  <ImageIcon className="w-4 h-4 mr-1" /> Slot de imagem
                  <ResizeHandles color="bg-blue-500" onResizeStart={(e, dir) => startResizeSlot(e, spec.imageSlot!, dir)} />
                </div>
              ),
            });
          }
          (spec.stickers ?? []).forEach((s, i) => {
            layers.push({
              order: s.order ?? i + 1,
              node: (
                <div
                  key={s.key}
                  onMouseDown={(e) => startDragStickerMove(e, s)}
                  className={`absolute border-2 ${selectedStickerKey === s.key || multiSelectKeys.has(`sticker:${s.key}`) ? "border-amber-500" : "border-violet-500"} cursor-move overflow-hidden`}
                  style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}
                >
                  {stickerUrls[s.key] ? (
                    <img src={stickerUrls[s.key]} alt={s.key} className="w-full h-full object-contain pointer-events-none" draggable={false} />
                  ) : (
                    <span className="text-[10px] font-medium bg-background/80 px-1 rounded truncate">{s.key}</span>
                  )}
                  <ResizeHandles color="bg-violet-500" onResizeStart={(e, dir) => startResizeSticker(e, s, dir)} />
                </div>
              ),
            });
          });
          const stickerCount = spec.stickers?.length ?? 0;
          spec.fields.forEach((f, i) => {
            layers.push({
              order: f.order ?? stickerCount + 1 + i,
              node: (
                <div
                  key={f.key}
                  onMouseDown={(e) => startDragFieldMove(e, f)}
                  className={`absolute border-2 ${selected === f.key || multiSelectKeys.has(`field:${f.key}`) ? "border-amber-500 bg-amber-400/20" : "border-emerald-500 bg-emerald-400/10"} cursor-move flex items-start p-1`}
                  style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
                >
                  <span className="text-[10px] font-medium bg-background/80 px-1 rounded truncate">{f.label}</span>
                  <ResizeHandles color="bg-amber-500" onResizeStart={(e, dir) => startResizeField(e, f, dir)} />
                </div>
              ),
            });
          });
          layers.sort((a, b) => a.order - b.order);
          return layers.map((l) => l.node);
        })()}

        {drawing && (
          <div
            className="absolute border-2 border-dashed border-primary bg-primary/10"
            style={{
              left: `${Math.min(drawing.x0, drawing.x)}%`,
              top: `${Math.min(drawing.y0, drawing.y)}%`,
              width: `${Math.abs(drawing.x - drawing.x0)}%`,
              height: `${Math.abs(drawing.y - drawing.y0)}%`,
            }}
          />
        )}

        {/* Guias de encaixe (snap) — igual Canva/Figma: uma linha magenta aparece quando o
            elemento sendo arrastado alinha com o centro do canvas ou com a borda/centro de
            outro elemento, e a posição "gruda" nela. */}
        {snapGuides.x !== null && (
          <div className="absolute inset-y-0 w-px bg-fuchsia-500 pointer-events-none z-10" style={{ left: `${snapGuides.x}%` }} />
        )}
        {snapGuides.y !== null && (
          <div className="absolute inset-x-0 h-px bg-fuchsia-500 pointer-events-none z-10" style={{ top: `${snapGuides.y}%` }} />
        )}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Arraste sobre a arte para criar um campo de texto, ou use "Novo elemento" pra já começar com uma posição
          típica pronta. Clique e arraste um campo para mover; use o quadradinho no canto para redimensionar.
        </p>

        {spec.fields.length === 0 && (
          <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Este formato ainda não tem nenhum <strong>campo de texto</strong> — só elementos gráficos fixos
              (logo, badge, box, etc). Elementos gráficos fixos são posicionáveis igual um campo, mas a IA não
              escreve neles: por isso este preset não aparece na tela de Gerar ainda. Use "Novo elemento" →
              Headline/Subtítulo/CTA (ou desenhe um retângulo sobre a arte) para criar pelo menos um campo real.
            </p>
          </div>
        )}

        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setShowAddMenu((v) => !v)}>
            <Plus className="w-4 h-4 mr-1" /> Novo elemento <ChevronDown className="w-3.5 h-3.5 ml-1" />
          </Button>
          {showAddMenu && (
            <div className="absolute z-10 mt-1 w-56 rounded-md border border-border bg-popover shadow-md p-1 space-y-0.5">
              <button onClick={() => addQuickField("headline")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted">Headline</button>
              <button onClick={() => addQuickField("subtitulo")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted">Subtítulo</button>
              <button onClick={() => addQuickField("cta")} className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted">
                CTA (contato) — reserva o lugar mesmo sem número ainda
              </button>
              <button
                onClick={requestStickerUpload}
                disabled={!onUploadSticker}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                Marca (logo) — sobe uma imagem
              </button>
              <button
                onClick={requestStickerUpload}
                disabled={!onUploadSticker}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                Grafismo — sobe uma imagem
              </button>
              <button
                onClick={requestFontUpload}
                disabled={!onUploadFont}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                Fonte de marca (.ttf/.otf) — só pra este formato
              </button>
            </div>
          )}
          <input
            ref={stickerInputRef}
            type="file"
            accept="image/png,image/webp,image/svg+xml,.svg"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0] && onUploadSticker) onUploadSticker(e.target.files[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={fontInputRef}
            type="file"
            accept=".ttf,.otf"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0] && onUploadFont) onUploadFont(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>

        {groupBox && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Alinhar {multiSelectBoxes.length} selecionados entre si</Label>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setMultiSelectKeys(new Set())}>
                  Limpar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Shift+clique em mais elementos pra adicionar/remover da seleção. Os botões abaixo
                alinham os selecionados entre si (não em relação ao canvas).
              </p>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alignGroup((box, group) => ({ x: group.x }))} title="Alinhar pela esquerda">
                  <AlignHorizontalJustifyStart className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alignGroup((box, group) => ({ x: group.x + group.w / 2 - box.w / 2 }))} title="Centralizar horizontalmente entre si">
                  <AlignHorizontalJustifyCenter className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alignGroup((box, group) => ({ x: group.x + group.w - box.w }))} title="Alinhar pela direita">
                  <AlignHorizontalJustifyEnd className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alignGroup((box, group) => ({ y: group.y }))} title="Alinhar pelo topo">
                  <AlignVerticalJustifyStart className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alignGroup((box, group) => ({ y: group.y + group.h / 2 - box.h / 2 }))} title="Centralizar verticalmente entre si">
                  <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => alignGroup((box, group) => ({ y: group.y + group.h - box.h }))} title="Alinhar pelo rodapé">
                  <AlignVerticalJustifyEnd className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {layerItems.length > 0 && (
          <CollapsibleCard title="Camadas" icon={<Layers className="w-3.5 h-3.5" />}>
              <p className="text-[10px] text-muted-foreground">
                Arraste pra mudar a ordem — o de cima fica na frente, igual no Adobe.
              </p>
              <div className="space-y-1">
                {layerItems.map((item, idx) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => setDragLayerId(item.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleLayerDrop(item.id)}
                    onClick={() => selectLayer(item)}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 cursor-grab active:cursor-grabbing ${
                      isLayerSelected(item) ? "bg-amber-100" : "hover:bg-muted"
                    } ${dragLayerId === item.id ? "opacity-40" : ""}`}
                  >
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <div className="w-6 h-6 rounded border border-border bg-background flex items-center justify-center shrink-0 overflow-hidden">
                      {item.kind === "sticker" && item.thumb ? (
                        <img src={item.thumb} alt="" className="w-full h-full object-contain" />
                      ) : item.kind === "image" ? (
                        <ImageIcon className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <Type className="w-3.5 h-3.5 text-emerald-600" />
                      )}
                    </div>
                    <span className="text-xs truncate flex-1">{item.label}</span>
                    <div className="flex flex-col shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayer(item.id, "up");
                        }}
                        disabled={idx === 0}
                        className="disabled:opacity-20 hover:text-primary"
                        title="Mover pra frente"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveLayer(item.id, "down");
                        }}
                        disabled={idx === layerItems.length - 1}
                        className="disabled:opacity-20 hover:text-primary rotate-180"
                        title="Mover pra trás"
                      >
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
          </CollapsibleCard>
        )}

        {!spec.imageSlot ? (
          <Button size="sm" variant="outline" onClick={addImageSlot}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar slot de imagem
          </Button>
        ) : (
          <CollapsibleCard
            title="Slot de imagem"
            actions={
              <Button size="icon" variant="ghost" onClick={() => commitSpec({ ...spec, imageSlot: undefined })}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            }
          >
              <AlignToolbar box={spec.imageSlot} onAlign={(patch) => updateImageSlot(patch)} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={Math.round(spec.imageSlot.x)} onChange={(e) => updateImageSlot({ x: Number(e.target.value) })} placeholder="x %" />
                <Input type="number" value={Math.round(spec.imageSlot.y)} onChange={(e) => updateImageSlot({ y: Number(e.target.value) })} placeholder="y %" />
              </div>
              <PixelSizeInputs
                wPercent={spec.imageSlot.w}
                hPercent={spec.imageSlot.h}
                canvasWidth={spec.width}
                canvasHeight={spec.height}
                onChange={({ w, h }) => updateImageSlot({ w, h })}
              />
              <div className="flex items-center justify-between pt-1">
                <Label className="text-xs text-muted-foreground">Máscara real (recorte pixel a pixel — tem prioridade sobre o raio abaixo)</Label>
                <Button size="sm" variant="outline" onClick={() => maskInputRef.current?.click()} disabled={!onUploadMask}>
                  <Upload className="w-3.5 h-3.5 mr-1" /> Enviar
                </Button>
              </div>
              {spec.imageSlot.maskPath ? (
                <div className="flex items-center justify-between text-xs bg-muted rounded-md px-2 py-1.5">
                  <span className="truncate">{spec.imageSlot.maskPath.split("/").pop()}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => updateImageSlot({ maskPath: undefined })}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ) : (
                <Label className="text-xs text-muted-foreground pt-1">Sem máscara real — usando o raio de canto abaixo como aproximação</Label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={spec.imageSlot.radiusTopLeft ?? 0} onChange={(e) => updateImageSlot({ radiusTopLeft: Number(e.target.value) })} placeholder="sup. esquerdo" />
                <Input type="number" value={spec.imageSlot.radiusTopRight ?? 0} onChange={(e) => updateImageSlot({ radiusTopRight: Number(e.target.value) })} placeholder="sup. direito" />
                <Input type="number" value={spec.imageSlot.radiusBottomLeft ?? 0} onChange={(e) => updateImageSlot({ radiusBottomLeft: Number(e.target.value) })} placeholder="inf. esquerdo" />
                <Input type="number" value={spec.imageSlot.radiusBottomRight ?? 0} onChange={(e) => updateImageSlot({ radiusBottomRight: Number(e.target.value) })} placeholder="inf. direito" />
              </div>
              <Label className="text-xs text-muted-foreground pt-1">Borda de contorno (usada só se não houver moldura importada)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="color" value={spec.imageSlot.borderColor ?? "#D4E157"} onChange={(e) => updateImageSlot({ borderColor: e.target.value })} />
                <Input type="number" value={spec.imageSlot.borderWidth ?? 0} onChange={(e) => updateImageSlot({ borderWidth: Number(e.target.value) })} placeholder="espessura px" />
              </div>
              {spec.imageSlot.framePath && (
                <div className="flex items-center justify-between text-xs bg-muted rounded-md px-2 py-1.5">
                  <span className="truncate">Moldura importada: {spec.imageSlot.framePath.split("/").pop()}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => updateImageSlot({ framePath: undefined })}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              )}
              <input
                ref={maskInputRef}
                type="file"
                accept="image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0] && onUploadMask) onUploadMask(e.target.files[0]);
                  e.target.value = "";
                }}
              />
          </CollapsibleCard>
        )}

        {selectedField && (
          <CollapsibleCard
            title="Campo selecionado"
            actions={
              <Button size="icon" variant="ghost" onClick={() => removeField(selectedField.key)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            }
          >
              <AlignToolbar box={selectedField} onAlign={(patch) => updateField(selectedField.key, (f) => ({ ...f, ...patch }))} />
              <Input
                value={selectedField.label}
                onChange={(e) => updateField(selectedField.key, (f) => ({ ...f, label: e.target.value }))}
                placeholder="Nome do campo (ex.: Preço)"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={selectedField.size ?? 32}
                  onChange={(e) => updateField(selectedField.key, (f) => ({ ...f, size: Number(e.target.value) }))}
                  placeholder="Tamanho (px)"
                />
                <Input
                  type="color"
                  value={selectedField.color ?? "#111827"}
                  onChange={(e) => updateField(selectedField.key, (f) => ({ ...f, color: e.target.value }))}
                />
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  value={selectedField.align ?? "left"}
                  onChange={(e) => updateField(selectedField.key, (f) => ({ ...f, align: e.target.value as TemplateField["align"] }))}
                >
                  <option value="left">Esquerda</option>
                  <option value="center">Centro</option>
                  <option value="right">Direita</option>
                </select>
                <Input
                  type="number"
                  value={selectedField.maxLines ?? 3}
                  onChange={(e) => updateField(selectedField.key, (f) => ({ ...f, maxLines: Number(e.target.value) }))}
                  placeholder="Nº máx. de linhas"
                />
              </div>
              <div className="pt-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Tamanho da caixa (resolução {spec.width}×{spec.height})</Label>
                <PixelSizeInputs
                  wPercent={selectedField.w}
                  hPercent={selectedField.h}
                  canvasWidth={spec.width}
                  canvasHeight={spec.height}
                  onChange={({ w, h }) => updateField(selectedField.key, (f) => ({ ...f, w, h }))}
                />
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <div>
                  <Label className="text-xs font-medium">Campo de contato</Label>
                  <p className="text-[10px] text-muted-foreground">Preenchido com o contato real escolhido na geração — a IA nunca escreve este campo.</p>
                </div>
                <Switch
                  checked={selectedField.dataBound ?? false}
                  onCheckedChange={(checked) => updateField(selectedField.key, (f) => ({ ...f, dataBound: checked }))}
                />
              </div>
          </CollapsibleCard>
        )}

        {((spec.backgroundPaths?.length ?? 0) > 0 || spec.fontFamily) && (
          <CollapsibleCard title="Fundo & fonte" defaultOpen={false}>
              <div className="text-xs text-muted-foreground space-y-1">
                {(spec.backgroundPaths?.length ?? 0) > 0 && <p>🖼️ {spec.backgroundPaths!.length} variação(ões) de fundo — uma é sorteada a cada geração.</p>}
                {spec.fontFamily && <p>🔤 Fonte de marca: {spec.fontFamily}{spec.fontPath ? "" : " (sem arquivo — usando fallback)"}</p>}
              </div>
          </CollapsibleCard>
        )}

        {(spec.stickers?.length ?? 0) > 0 && (
          <CollapsibleCard title="Elementos gráficos fixos" icon={<Sparkle className="w-3.5 h-3.5" />}>
              {spec.stickers!.map((s) => (
                <div key={s.key} className="space-y-1 border-t border-border pt-2 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{s.key}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeSticker(s.key)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <AlignToolbar box={s} onAlign={(patch) => updateSticker(s.key, patch)} />
                  <div className="grid grid-cols-2 gap-1">
                    <Input type="number" value={Math.round(s.x)} onChange={(e) => updateSticker(s.key, { x: Number(e.target.value) })} placeholder="x %" />
                    <Input type="number" value={Math.round(s.y)} onChange={(e) => updateSticker(s.key, { y: Number(e.target.value) })} placeholder="y %" />
                  </div>
                  <PixelSizeInputs
                    wPercent={s.w}
                    hPercent={s.h}
                    canvasWidth={spec.width}
                    canvasHeight={spec.height}
                    onChange={({ w, h }) => updateSticker(s.key, { w, h })}
                  />
                </div>
              ))}
          </CollapsibleCard>
        )}

        {spec.fields.length > 0 && (
          <CollapsibleCard title={`Todos os campos (${spec.fields.length})`} defaultOpen={false}>
              <div className="space-y-1">
                {spec.fields.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setSelected(f.key)}
                    className={`w-full text-left text-xs px-2 py-1 rounded ${selected === f.key ? "bg-amber-100" : "hover:bg-muted"}`}
                  >
                    {f.label} <span className="text-muted-foreground">({f.key})</span>
                  </button>
                ))}
              </div>
          </CollapsibleCard>
        )}
      </div>
    </div>
  );
};
