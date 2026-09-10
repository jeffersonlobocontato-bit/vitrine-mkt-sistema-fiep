import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus, Image as ImageIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { FormatTemplateSpec, TemplateField } from "@/components/TemplateRenderer";

interface Props {
  referenceUrl: string;
  spec: FormatTemplateSpec;
  onChange: (spec: FormatTemplateSpec) => void;
}

let fieldCounter = 0;

/**
 * Editor visual do preset: o designer desenha retângulos sobre a arte de
 * referência (exportada do Adobe) para definir cada campo de texto e o slot
 * de imagem. Isso vira o template_spec que o TemplateRenderer usa depois — a
 * IA nunca decide layout, só preenche o que já foi desenhado aqui.
 */
export const PresetEditor = ({ referenceUrl, spec, onChange }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ key: string; mode: "move" | "resize"; startX: number; startY: number; field: TemplateField } | null>(null);

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
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (drawing) {
      const p = pct(e.clientX, e.clientY);
      setDrawing({ ...drawing, x: p.x, y: p.y });
    } else if (drag) {
      const p = pct(e.clientX, e.clientY);
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      updateField(drag.key, (f) =>
        drag.mode === "move"
          ? { ...f, x: Math.max(0, Math.min(100 - f.w, drag.field.x + dx)), y: Math.max(0, Math.min(100 - f.h, drag.field.y + dy)) }
          : { ...f, w: Math.max(4, Math.min(100 - f.x, drag.field.w + dx)), h: Math.max(3, Math.min(100 - f.y, drag.field.h + dy)) },
      );
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
    const p = pct(e.clientX, e.clientY);
    setDrag({ key: field.key, mode, startX: p.x, startY: p.y, field });
  };

  const addImageSlot = () => {
    onChange({ ...spec, imageSlot: { x: 10, y: 10, w: 80, h: 40 } });
  };

  const updateImageSlot = (patch: Partial<FormatTemplateSpec["imageSlot"]>) => {
    if (!spec.imageSlot) return;
    onChange({ ...spec, imageSlot: { ...spec.imageSlot, ...patch } });
  };

  const selectedField = spec.fields.find((f) => f.key === selected);

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4">
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

      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Arraste sobre a arte para criar um campo de texto. Clique e arraste um campo para mover; use o quadradinho
          no canto para redimensionar.
        </p>

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
              <Label className="text-xs text-muted-foreground pt-1">Borda de contorno (opcional)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="color" value={spec.imageSlot.borderColor ?? "#D4E157"} onChange={(e) => updateImageSlot({ borderColor: e.target.value })} />
                <Input type="number" value={spec.imageSlot.borderWidth ?? 0} onChange={(e) => updateImageSlot({ borderWidth: Number(e.target.value) })} placeholder="espessura px" />
              </div>
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
