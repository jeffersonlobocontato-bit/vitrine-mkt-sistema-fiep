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
import { Loader2, ArrowLeft, Plus, Upload, PackageOpen, Sparkle, ChevronDown, ChevronRight, Library } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { PresetEditor } from "@/components/PresetEditor";
import type { FormatTemplateSpec, StickerAsset, TemplateSpec } from "@/components/TemplateRenderer";

// agent_presets/preset_reference_files ainda não estão totalmente no types.ts gerado
// (as colunas novas de casa/template_spec não existem no tipo antigo).
const db = supabase as any;

const FORMATS: { id: "card" | "carousel" | "story"; label: string; w: number; h: number }[] = [
  { id: "card", label: "Card", w: 1080, h: 1350 },
  { id: "carousel", label: "Carrossel", w: 1080, h: 1350 },
  { id: "story", label: "Story", w: 1080, h: 1920 },
];

const emptySpec = (w: number, h: number): FormatTemplateSpec => ({ width: w, height: h, fields: [] });

const KIND_LABEL: Record<RefFile["kind"], string> = {
  arte_pronta: "Arte de referência",
  componente: "Componente",
  regra_texto: "Regras da arte (texto)",
};

/** Cruza o arquivo salvo em preset_reference_files com o template_spec de cada formato pra
 * explicar, em linguagem simples, onde exatamente ele é usado (ou se ainda não é usado). */
const describeFile = (preset: Preset, file: RefFile): { role: string; formats: string[] } => {
  const roles = new Set<string>();
  const formats = new Set<string>();
  (["card", "carousel", "story"] as const).forEach((fmt) => {
    const spec = preset.template_spec[fmt];
    if (!spec) return;
    if (spec.backgroundPath === file.storage_path) {
      roles.add("Fundo fixo do card");
      formats.add(fmt);
    }
    if (spec.backgroundPaths?.includes(file.storage_path)) {
      roles.add("Variação de fundo (sorteada a cada geração)");
      formats.add(fmt);
    }
    if (spec.imageSlot?.framePath === file.storage_path) {
      roles.add("Moldura desenhada por cima da foto");
      formats.add(fmt);
    }
    if (spec.fontPath === file.storage_path) {
      roles.add(`Fonte de marca${spec.fontFamily ? ` ("${spec.fontFamily}")` : ""}, usada no texto dos campos`);
      formats.add(fmt);
    }
    const sticker = spec.stickers?.find((s) => s.path === file.storage_path);
    if (sticker) {
      roles.add(`Elemento gráfico fixo ("${sticker.key}") — sempre a mesma imagem, a IA nunca escreve nele`);
      formats.add(fmt);
    }
  });
  if (roles.size > 0) return { role: [...roles].join(" · "), formats: [...formats] };
  if (file.kind === "regra_texto") return { role: "Texto de apoio pro designer — não entra na arte gerada", formats: [] };
  return { role: "Enviado, mas ainda não posicionado em nenhum campo do preset", formats: [] };
};

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
  const { loading, user, hasCasaRole, isPlatformAdmin, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);
  const canManage = casa ? isPlatformAdmin || hasCasaRole(casa.id, "designer") : false;

  const [presets, setPresets] = useState<Preset[]>([]);
  const [files, setFiles] = useState<Record<string, RefFile[]>>({});
  const [newName, setNewName] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [activeFormat, setActiveFormat] = useState<"card" | "carousel" | "story">("card");
  const [refUrls, setRefUrls] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState<Record<string, boolean>>({});

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
        // Chave é o storage_path puro (já é único, contém preset_id) — resolve independente
        // de qual formato está ativo na tela no momento do upload.
        if (signed) setRefUrls((prev) => ({ ...prev, [f.storage_path]: signed.signedUrl }));
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
      created_by: user?.id ?? null,
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

  /**
   * Importa um pacote de componentes (.zip) exportado pelo design — ex.: Fundo_01/02/03.png
   * (variações de fundo), Contorno_Container_Foto.png (moldura da foto), NR01_Transparente.png
   * (elemento gráfico fixo), Foun.ttf (fonte de marca). Classifica cada arquivo pelo nome,
   * sobe tudo pro bucket preset-assets, grava um preset_reference_files por item (rastreável
   * mesmo quando não vira campo do template_spec) e funde o resultado no spec do formato ativo.
   */
  const importComponentPack = async (preset: Preset, format: "card" | "carousel" | "story", file: File) => {
    setImporting(true);
    try {
      const zip = await JSZip.loadAsync(file);
      const current = preset.template_spec[format] ?? emptySpec(1080, format === "story" ? 1920 : 1350);
      const backgroundPaths = [...(current.backgroundPaths ?? [])];
      const stickers: StickerAsset[] = [...(current.stickers ?? [])];
      let framePath = current.imageSlot?.framePath;
      let fontFamily = current.fontFamily;
      let fontPath = current.fontPath;
      let imported = 0;

      const entries = Object.values(zip.files).filter((f) => !f.dir);
      for (const entry of entries) {
        const filename = entry.name.split("/").pop() || entry.name;
        const lower = filename.toLowerCase();
        const ext = filename.split(".").pop()?.toLowerCase() ?? "";
        const path = `${preset.id}/pack-${crypto.randomUUID()}-${filename.replace(/[^\w.-]+/g, "_")}`;

        if (ext === "otf" || ext === "ttf") {
          const blob = await entry.async("blob");
          const { error } = await supabase.storage.from("preset-assets").upload(path, blob);
          if (error) continue;
          await db.from("preset_reference_files").insert({ preset_id: preset.id, kind: "componente", storage_path: path });
          imported++;
          // Prioriza .ttf (compatibilidade de navegador mais ampla) sobre .otf quando os dois vierem no pacote.
          if (!fontPath || ext === "ttf") {
            fontPath = path;
            fontFamily = filename.replace(/\.(otf|ttf)$/i, "").replace(/[_-]/g, " ").trim() || "Marca";
          }
          continue;
        }

        if (!["png", "jpg", "jpeg", "webp"].includes(ext)) continue;
        const blob = await entry.async("blob");
        const { error } = await supabase.storage.from("preset-assets").upload(path, blob);
        if (error) continue;
        await db.from("preset_reference_files").insert({ preset_id: preset.id, kind: "componente", storage_path: path });
        imported++;

        if (lower.includes("fundo")) {
          backgroundPaths.push(path);
        } else if (lower.startsWith("contorno")) {
          framePath = path;
        } else if (lower.startsWith("container")) {
          // silhueta/máscara do slot de foto — guardada como componente de referência;
          // a máscara em si já é modelada pelos raios de canto do imageSlot.
        } else {
          const key = filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
          if (!stickers.some((s) => s.key === key)) {
            stickers.push({ key, path, x: 10, y: 10, w: 30, h: 15 });
          }
        }
      }

      if (imported === 0) {
        toast.error("Nenhum arquivo reconhecido dentro do .zip");
        return;
      }

      const nextSpec: FormatTemplateSpec = {
        ...current,
        backgroundPaths,
        stickers,
        fontFamily,
        fontPath,
        imageSlot: current.imageSlot
          ? { ...current.imageSlot, framePath }
          : framePath
            ? { x: 10, y: 10, w: 80, h: 40, framePath }
            : current.imageSlot,
      };
      await saveSpec(preset, format, nextSpec);
      toast.success(`${imported} elemento(s) importado(s)`);
      await loadFiles(preset.id);
    } catch (e) {
      toast.error("Falha ao importar pacote: " + (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  /**
   * Sobe um único elemento gráfico fixo (ex.: a marca/logo recortada do card de referência do
   * outro formato) direto como sticker — sem precisar montar um .zip pra adicionar só um item.
   */
  const addSticker = async (preset: Preset, format: "card" | "carousel" | "story", file: File) => {
    const path = `${preset.id}/sticker-${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("preset-assets").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    await db.from("preset_reference_files").insert({ preset_id: preset.id, kind: "componente", storage_path: path });

    const current = preset.template_spec[format] ?? emptySpec(1080, format === "story" ? 1920 : 1350);
    const key = file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const stickers = [...(current.stickers ?? [])];
    if (!stickers.some((s) => s.key === key)) stickers.push({ key, path, x: 10, y: 4, w: 30, h: 8 });
    await saveSpec(preset, format, { ...current, stickers });
    toast.success("Elemento gráfico adicionado — ajuste a posição no editor abaixo");
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
          const spec = preset.template_spec[activeFormat] ?? emptySpec(1080, 1350);
          // A arte de referência do formato ativo é a que está gravada em spec.backgroundPath
          // (setada no upload — ver uploadReference), não precisa mais adivinhar por nome de arquivo.
          const refUrl = spec.backgroundPath ? refUrls[spec.backgroundPath] : undefined;

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
                  <button
                    onClick={() => setLibraryOpen((prev) => ({ ...prev, [preset.id]: !prev[preset.id] }))}
                    className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {libraryOpen[preset.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Library className="w-4 h-4" />
                    Biblioteca deste preset ({(files[preset.id] ?? []).length} arquivo(s))
                  </button>
                  {libraryOpen[preset.id] && (
                    <div className="rounded-lg border border-border divide-y divide-border">
                      {(files[preset.id] ?? []).length === 0 && (
                        <p className="text-xs text-muted-foreground p-3">Nenhum arquivo enviado ainda.</p>
                      )}
                      {(files[preset.id] ?? []).map((f) => {
                        const { role, formats } = describeFile(preset, f);
                        return (
                          <div key={f.id} className="p-3 space-y-1">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{f.storage_path.split("/").pop()}</span>
                              <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded shrink-0">
                                {KIND_LABEL[f.kind]}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {role}
                              {formats.length > 0 && ` — ${formats.map((fmt) => FORMATS.find((x) => x.id === fmt)?.label ?? fmt).join(", ")}`}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}

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
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept=".zip"
                              className="hidden"
                              disabled={importing}
                              onChange={(e) => {
                                if (e.target.files?.[0]) importComponentPack(preset, f.id, e.target.files[0]);
                                e.target.value = "";
                              }}
                            />
                            <Button size="sm" variant="outline" disabled={importing} asChild>
                              <span>
                                {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PackageOpen className="w-4 h-4 mr-1" />}
                                Importar pacote (.zip)
                              </span>
                            </Button>
                          </label>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/png,image/webp"
                              className="hidden"
                              onChange={(e) => e.target.files?.[0] && addSticker(preset, f.id, e.target.files[0])}
                            />
                            <Button size="sm" variant="outline" asChild>
                              <span><Sparkle className="w-4 h-4 mr-1" /> Elemento gráfico avulso</span>
                            </Button>
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          O .zip pode trazer fundos (nome com "fundo" — várias variações sorteadas por geração), moldura
                          da foto (nome começando com "contorno"), elementos gráficos fixos (qualquer outro PNG) e a
                          fonte de marca (.ttf/.otf) — cada um é classificado e guardado automaticamente. Use "Elemento
                          gráfico avulso" pra adicionar só um item (ex.: a marca Sesi recortada de outro formato) sem
                          precisar montar um zip novo — elementos gráficos são sempre a mesma imagem, a IA nunca escreve
                          neles (a palavra-chave "NR-01", por exemplo, não precisa de campo de texto — só posicionar
                          o elemento já importado).
                        </p>
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
