import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus, Image as ImageIcon, Sparkle, ChevronDown, Grid3x3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { FormatTemplateSpec, StickerAsset, TemplateField } from "@/components/TemplateRenderer";

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

/**
 * Editor visual do preset: o designer desenha retângulos sobre a arte de
 * referência (exportada do Adobe) para definir cada campo de texto e o slot
 * de imagem. Isso vira o template_spec que o TemplateRenderer usa depois — a
 * IA nunca decide layout, só preenche o que já foi desenhado aqui.
 */
export const PresetEditor = ({ referenceUrl, spec, onChange, onUploadSticker, onUploadFont }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedStickerKey, setSelectedStickerKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<
    | { kind: "field"; key: string; mode: "move" | "resize"; startX: number; startY: number; field: TemplateField }
    | { kind: "sticker"; key: string; mode: "move" | "resize"; startX: number; startY: number; sticker: StickerAsset }
    | null
  >(null);
  // Signed URLs das imagens de sticker pra exibir o elemento direto no grid (o bucket é privado).
  const [stickerUrls, setStickerUrls] = useState<Record<string, string>>({});
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

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
        updateField(drag.key, (f) =>
          drag.mode === "move"
            ? { ...f, x: Math.max(0, Math.min(100 - f.w, f0.x + dx)), y: Math.max(0, Math.min(100 - f.h, f0.y + dy)) }
            : { ...f, w: Math.max(4, Math.min(100 - f.x, f0.w + dx)), h: Math.max(3, Math.min(100 - f.y, f0.h + dy)) },
        );
      } else {
        const s0 = drag.sticker;
        updateSticker(drag.key,
          drag.mode === "move"
            ? { x: Math.max(0, Math.min(100 - s0.w, s0.x + dx)), y: Math.max(0, Math.min(100 - s0.h, s0.y + dy)) }
            : { w: Math.max(2, Math.min(100 - s0.x, s0.w + dx)), h: Math.max(2, Math.min(100 - s0.y, s0.h + dy)) },
        );
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
        onChange({ ...spec, fields: [...spec.fields, field] });
        setSelected(key);
      }
      setDrawing(null);
    }
    setDrag(null);
  };

  const updateField = (key: string, fn: (f: TemplateField) => TemplateField) => {
    onChange({ ...spec, fields: spec.fields.map((f) => (f.key === key ? fn(f) : f)) });
  };

  const removeField = (key: string) => {
    onChange({ ...spec, fields: spec.fields.filter((f) => f.key !== key) });
    if (selected === key) setSelected(null);
  };

  const startDragField = (e: React.MouseEvent, field: TemplateField, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelected(field.key);
    setSelectedStickerKey(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "field", key: field.key, mode, startX: p.x, startY: p.y, field });
  };

  const startDragSticker = (e: React.MouseEvent, sticker: StickerAsset, mode: "move" | "resize") => {
    e.stopPropagation();
    setSelectedStickerKey(sticker.key);
    setSelected(null);
    const p = pct(e.clientX, e.clientY);
    setDrag({ kind: "sticker", key: sticker.key, mode, startX: p.x, startY: p.y, sticker });
  };

  const addImageSlot = () => {
    onChange({ ...spec, imageSlot: { x: 10, y: 10, w: 80, h: 40 } });
  };

  const updateImageSlot = (patch: Partial<FormatTemplateSpec["imageSlot"]>) => {
    if (!spec.imageSlot) return;
    onChange({ ...spec, imageSlot: { ...spec.imageSlot, ...patch } });
  };

  const addQuickField = (type: keyof typeof QUICK_FIELDS) => {
    fieldCounter += 1;
    const field: TemplateField = { ...QUICK_FIELDS[type], key: `${type}_${fieldCounter}` };
    onChange({ ...spec, fields: [...spec.fields, field] });
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
    onChange({ ...spec, stickers: (spec.stickers ?? []).map((s) => (s.key === key ? { ...s, ...patch } : s)) });
  };

  const removeSticker = (key: string) => {
    onChange({ ...spec, stickers: (spec.stickers ?? []).filter((s) => s.key !== key) });
  };

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

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
      <div className="space-y-2">
        <Button size="sm" variant={showGrid ? "default" : "outline"} onClick={() => setShowGrid((v) => !v)}>
          <Grid3x3 className="w-4 h-4 mr-1" /> Grade (5mm)
        </Button>
        <div
          ref={containerRef}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          className="relative border border-border rounded-lg overflow-hidden select-none cursor-crosshair"
          style={{ aspectRatio: `${spec.width} / ${spec.height}`, maxHeight: "70vh" }}
        >
          <img data-canvas-bg src={referenceUrl} alt="Referência" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />

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

        {spec.imageSlot && (
          <div
            className="absolute border-2 border-blue-400 bg-blue-400/10 flex items-center justify-center text-xs text-blue-700 font-medium"
            style={{ left: `${spec.imageSlot.x}%`, top: `${spec.imageSlot.y}%`, width: `${spec.imageSlot.w}%`, height: `${spec.imageSlot.h}%` }}
          >
            <ImageIcon className="w-4 h-4 mr-1" /> Slot de imagem
          </div>
        )}

        {spec.fields.map((f) => (
          <div
            key={f.key}
            onMouseDown={(e) => startDragField(e, f, "move")}
            className={`absolute border-2 ${selected === f.key ? "border-amber-500 bg-amber-400/20" : "border-emerald-500 bg-emerald-400/10"} cursor-move flex items-start p-1`}
            style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` }}
          >
            <span className="text-[10px] font-medium bg-background/80 px-1 rounded truncate">{f.label}</span>
            <div
              onMouseDown={(e) => startDragField(e, f, "resize")}
              className="absolute bottom-0 right-0 w-3 h-3 bg-amber-600 cursor-se-resize"
            />
          </div>
        ))}

        {(spec.stickers ?? []).map((s) => (
          <div
            key={s.key}
            onMouseDown={(e) => startDragSticker(e, s, "move")}
            className={`absolute border-2 ${selectedStickerKey === s.key ? "border-amber-500" : "border-violet-500"} cursor-move overflow-hidden`}
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}
          >
            {stickerUrls[s.key] ? (
              <img src={stickerUrls[s.key]} alt={s.key} className="w-full h-full object-contain pointer-events-none" draggable={false} />
            ) : (
              <span className="text-[10px] font-medium bg-background/80 px-1 rounded truncate">{s.key}</span>
            )}
            <div
              onMouseDown={(e) => startDragSticker(e, s, "resize")}
              className="absolute bottom-0 right-0 w-3 h-3 bg-violet-600 cursor-se-resize"
            />
          </div>
        ))}

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
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Arraste sobre a arte para criar um campo de texto, ou use "Novo elemento" pra já começar com uma posição
          típica pronta. Clique e arraste um campo para mover; use o quadradinho no canto para redimensionar.
        </p>

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

        {!spec.imageSlot ? (
          <Button size="sm" variant="outline" onClick={addImageSlot}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar slot de imagem
          </Button>
        ) : (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Slot de imagem</Label>
                <Button size="icon" variant="ghost" onClick={() => onChange({ ...spec, imageSlot: undefined })}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="number" value={Math.round(spec.imageSlot.x)} onChange={(e) => updateImageSlot({ x: Number(e.target.value) })} placeholder="x %" />
                <Input type="number" value={Math.round(spec.imageSlot.y)} onChange={(e) => updateImageSlot({ y: Number(e.target.value) })} placeholder="y %" />
                <Input type="number" value={Math.round(spec.imageSlot.w)} onChange={(e) => updateImageSlot({ w: Number(e.target.value) })} placeholder="largura %" />
                <Input type="number" value={Math.round(spec.imageSlot.h)} onChange={(e) => updateImageSlot({ h: Number(e.target.value) })} placeholder="altura %" />
              </div>
              <Label className="text-xs text-muted-foreground pt-1">Máscara (raio de cada canto, px)</Label>
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
            </CardContent>
          </Card>
        )}

        {selectedField && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Campo selecionado</Label>
                <Button size="icon" variant="ghost" onClick={() => removeField(selectedField.key)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
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
            </CardContent>
          </Card>
        )}

        {((spec.backgroundPaths?.length ?? 0) > 0 || spec.fontFamily) && (
          <Card>
            <CardContent className="p-3 space-y-1 text-xs text-muted-foreground">
              {(spec.backgroundPaths?.length ?? 0) > 0 && <p>🖼️ {spec.backgroundPaths!.length} variação(ões) de fundo — uma é sorteada a cada geração.</p>}
              {spec.fontFamily && <p>🔤 Fonte de marca: {spec.fontFamily}{spec.fontPath ? "" : " (sem arquivo — usando fallback)"}</p>}
            </CardContent>
          </Card>
        )}

        {(spec.stickers?.length ?? 0) > 0 && (
          <Card>
            <CardContent className="p-3 space-y-3">
              <Label className="text-xs font-medium flex items-center gap-1"><Sparkle className="w-3.5 h-3.5" /> Elementos gráficos fixos</Label>
              {spec.stickers!.map((s) => (
                <div key={s.key} className="space-y-1 border-t border-border pt-2 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{s.key}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeSticker(s.key)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    <Input type="number" value={Math.round(s.x)} onChange={(e) => updateSticker(s.key, { x: Number(e.target.value) })} placeholder="x %" />
                    <Input type="number" value={Math.round(s.y)} onChange={(e) => updateSticker(s.key, { y: Number(e.target.value) })} placeholder="y %" />
                    <Input type="number" value={Math.round(s.w)} onChange={(e) => updateSticker(s.key, { w: Number(e.target.value) })} placeholder="larg %" />
                    <Input type="number" value={Math.round(s.h)} onChange={(e) => updateSticker(s.key, { h: Number(e.target.value) })} placeholder="alt %" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="space-y-1">
          <Label className="text-xs font-medium">Todos os campos</Label>
          {spec.fields.length === 0 && <p className="text-xs text-muted-foreground">Nenhum campo ainda.</p>}
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
      </div>
    </div>
  );
};
