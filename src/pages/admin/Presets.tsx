import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { PresetEditor } from "@/components/PresetEditor";
import type { FormatTemplateSpec, TemplateSpec } from "@/components/TemplateRenderer";

// agent_presets/preset_reference_files ainda não estão totalmente no types.ts gerado
// (as colunas novas de casa/template_spec não existem no tipo antigo).
const db = supabase as any;

const FORMATS: { id: "card" | "carousel" | "story"; label: string; w: number; h: number }[] = [
  { id: "card", label: "Card", w: 1080, h: 1350 },
  { id: "carousel", label: "Carrossel", w: 1080, h: 1350 },
  { id: "story", label: "Story", w: 1080, h: 1920 },
];

const emptySpec = (w: number, h: number): FormatTemplateSpec => ({ width: w, height: h, fields: [] });

interface Preset {
  id: string;
  name: string;
  is_default: boolean;
  template_locked: boolean;
  template_spec: TemplateSpec;
}
interface RefFile {
  id: string;
  preset_id: string;
  kind: "arte_pronta" | "componente" | "regra_texto";
  storage_path: string;
}

const AdminPresets = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { loading, hasCasaRole, isPlatformAdmin, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);
  const canManage = casa ? isPlatformAdmin || hasCasaRole(casa.id, "designer") : false;

  const [presets, setPresets] = useState<Preset[]>([]);
  const [files, setFiles] = useState<Record<string, RefFile[]>>({});
  const [newName, setNewName] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFormat, setActiveFormat] = useState<"card" | "carousel" | "story">("card");
  const [refUrls, setRefUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!casa) return;
    const { data } = await db.from("agent_presets").select("id, name, is_default, template_locked, template_spec").eq("casa_id", casa.id).order("name");
    setPresets((data ?? []) as Preset[]);
  }, [casa]);

  useEffect(() => {
    if (casa) load();
  }, [casa, load]);

  useEffect(() => {
    if (!loading && casa && !canManage) navigate("/admin", { replace: true });
  }, [loading, casa, canManage, navigate]);

  const loadFiles = async (presetId: string) => {
    const { data } = await db.from("preset_reference_files").select("*").eq("preset_id", presetId);
    setFiles((prev) => ({ ...prev, [presetId]: (data ?? []) as RefFile[] }));
    for (const f of (data ?? []) as RefFile[]) {
      if (f.kind === "arte_pronta") {
        const { data: signed } = await supabase.storage.from("preset-assets").createSignedUrl(f.storage_path, 3600);
        if (signed) setRefUrls((prev) => ({ ...prev, [`${presetId}:${f.storage_path}`]: signed.signedUrl }));
      }
    }
  };

  const openPreset = (id: string) => {
    setActivePreset(activePreset === id ? null : id);
    if (activePreset !== id) loadFiles(id);
  };

  const createPreset = async () => {
    if (!casa || !newName.trim()) return toast.error("Informe um nome");
    const { error } = await db.from("agent_presets").insert({
      casa_id: casa.id,
      name: newName.trim(),
      template_locked: true,
      template_spec: {
        card: emptySpec(1080, 1350),
        carousel: emptySpec(1080, 1350),
        story: emptySpec(1080, 1920),
      },
    });
    if (error) return toast.error(error.message);
    setNewName("");
    toast.success("Preset criado");
    await load();
  };

  const uploadReference = async (preset: Preset, kind: RefFile["kind"], file: File, format?: "card" | "carousel" | "story") => {
    const path = `${preset.id}/${kind}-${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("preset-assets").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { error } = await db.from("preset_reference_files").insert({ preset_id: preset.id, kind, storage_path: path });
    if (error) return toast.error(error.message);
    // A arte de referência não é só um guia pro editor — vira o fundo de verdade usado
    // na geração (logo, gradiente, textura de marca), por isso grava no template_spec.
    if (kind === "arte_pronta" && format) {
      const current = preset.template_spec[format] ?? emptySpec(1080, format === "story" ? 1920 : 1350);
      await saveSpec(preset, format, { ...current, backgroundPath: path });
    }
    toast.success("Arquivo enviado");
    await loadFiles(preset.id);
  };

  const saveSpec = async (preset: Preset, format: "card" | "carousel" | "story", spec: FormatTemplateSpec) => {
    const nextSpec = { ...preset.template_spec, [format]: spec };
    setPresets((prev) => prev.map((p) => (p.id === preset.id ? { ...p, template_spec: nextSpec } : p)));
    await db.from("agent_presets").update({ template_spec: nextSpec }).eq("id", preset.id);
  };

  if (loading || !casa) return <Loader2 className="w-6 h-6 animate-spin m-8" />;
  if (!canManage) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/casa/${casa.slug}`}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-xl font-bold">Presets — {casa.nome}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <p className="text-sm text-muted-foreground max-w-2xl">
          Suba a arte pronta (Adobe) por formato como referência, depois desenhe os campos variáveis sobre ela.
          Vendedor/social media nunca editam isso — só escolhem campanha + formato e o sistema preenche exatamente
          como definido aqui.
        </p>

        {presets.map((preset) => {
          const presetFiles = files[preset.id] ?? [];
          const spec = preset.template_spec[activeFormat] ?? emptySpec(1080, 1350);
          const arteReferencia = presetFiles.find((f) => f.kind === "arte_pronta" && f.storage_path.includes(activeFormat));
          const refUrl = arteReferencia ? refUrls[`${preset.id}:${arteReferencia.storage_path}`] : undefined;

          return (
            <Card key={preset.id}>
              <CardHeader className="cursor-pointer" onClick={() => openPreset(preset.id)}>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{preset.name}</CardTitle>
                  {preset.is_default && <span className="text-xs text-muted-foreground">padrão</span>}
                </div>
                <CardDescription>Template fechado — clique para editar</CardDescription>
              </CardHeader>
              {activePreset === preset.id && (
                <CardContent className="space-y-4">
                  <Tabs value={activeFormat} onValueChange={(v) => setActiveFormat(v as typeof activeFormat)}>
                    <TabsList>
                      {FORMATS.map((f) => (
                        <TabsTrigger key={f.id} value={f.id}>{f.label}</TabsTrigger>
                      ))}
                    </TabsList>
                    {FORMATS.map((f) => (
                      <TabsContent key={f.id} value={f.id} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Arte de referência ({f.label})</Label>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && uploadReference(preset, "arte_pronta", e.target.files[0], f.id)}
                            />
                            <Button size="sm" variant="outline" asChild>
                              <span><Upload className="w-4 h-4 mr-1" /> Enviar arte</span>
                            </Button>
                          </label>
                        </div>
                        {refUrl ? (
                          <PresetEditor
                            referenceUrl={refUrl}
                            spec={preset.template_spec[f.id] ?? emptySpec(f.w, f.h)}
                            onChange={(next) => saveSpec(preset, f.id, next)}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">Envie a arte de referência deste formato para começar a mapear os campos.</p>
                        )}
                      </TabsContent>
                    ))}
                  </Tabs>

                  <div className="grid sm:grid-cols-2 gap-2 pt-4 border-t border-border">
                    <label className="cursor-pointer">
                      <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadReference(preset, "componente", e.target.files[0])} />
                      <Button size="sm" variant="outline" asChild className="w-full"><span><Upload className="w-4 h-4 mr-1" /> Componente (logo/textura)</span></Button>
                    </label>
                    <label className="cursor-pointer">
                      <input type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => e.target.files?.[0] && uploadReference(preset, "regra_texto", e.target.files[0])} />
                      <Button size="sm" variant="outline" asChild className="w-full"><span><Upload className="w-4 h-4 mr-1" /> Regras da arte (texto)</span></Button>
                    </label>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}

        <div className="flex gap-2 items-end">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">Novo preset</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Matrículas Colégio Sesi" />
          </div>
          <Button onClick={createPreset}><Plus className="w-4 h-4 mr-1" /> Criar</Button>
        </div>
      </main>
    </div>
  );
};

export default AdminPresets;
