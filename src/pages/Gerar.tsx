import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toBlob } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Sparkles, Check, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TemplateRenderer, type FormatTemplateSpec } from "@/components/TemplateRenderer";

// casas/campanhas/campanha_itens/agent_presets(template_spec)/instagram_creatives(campanha_item_id)
// ainda não estão totalmente no types.ts gerado.
const db = supabase as any;

type Format = "card" | "carousel" | "story";
const FORMATS: { id: Format; label: string }[] = [
  { id: "card", label: "Card" },
  { id: "carousel", label: "Carrossel" },
  { id: "story", label: "Story" },
];

interface Campanha { id: string; nome: string; escopo: "por_unidade" | "geral"; ativo: boolean }
interface Item { id: string; nome: string; unidade_id: string | null; ativo: boolean }
interface Preset { id: string; name: string; template_spec: Partial<Record<Format, FormatTemplateSpec>> }
interface Slide { order: number; values: Record<string, string>; image_url?: string }
interface Creative { id: string; format: Format; caption: string; hashtags: string[]; slides: Slide[]; status: string; final_image_urls: string[]; preset_id: string }

const Gerar = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const casaSlugHint = searchParams.get("casa");
  const { loading, user, casasAcessiveis } = useCasaAcesso();

  const [casaId, setCasaId] = useState<string | null>(null);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [campanhaId, setCampanhaId] = useState<string>("");
  const [itens, setItens] = useState<Item[]>([]);
  const [itemId, setItemId] = useState<string>("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetId, setPresetId] = useState<string>("");
  const [format, setFormat] = useState<Format>("card");
  const [generating, setGenerating] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [creative, setCreative] = useState<Creative | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const exportRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!loading) {
      if (!user) return navigate("/auth", { replace: true });
      const fromHint = casaSlugHint ? casasAcessiveis.find((c) => c.slug === casaSlugHint) : null;
      if (fromHint) setCasaId(fromHint.id);
      else if (casasAcessiveis.length === 1) setCasaId(casasAcessiveis[0].id);
    }
  }, [loading, user, casasAcessiveis, casaSlugHint, navigate]);

  const casa = casasAcessiveis.find((c) => c.id === casaId);

  const loadCampanhas = useCallback(async () => {
    if (!casaId) return;
    const { data } = await db.from("campanhas").select("id, nome, escopo, ativo").eq("casa_id", casaId).eq("ativo", true).order("nome");
    setCampanhas((data ?? []) as Campanha[]);
    const { data: p } = await db.from("agent_presets").select("id, name, template_spec").eq("casa_id", casaId);
    setPresets((p ?? []) as Preset[]);
  }, [casaId]);

  useEffect(() => {
    setCampanhaId("");
    setItemId("");
    loadCampanhas();
  }, [casaId, loadCampanhas]);

  useEffect(() => {
    if (!campanhaId) return setItens([]);
    db.from("campanha_itens").select("id, nome, unidade_id, ativo").eq("campanha_id", campanhaId).eq("ativo", true).order("nome").then(({ data }: any) => setItens((data ?? []) as Item[]));
    setItemId("");
  }, [campanhaId]);

  const validPresets = presets.filter((p) => (p.template_spec?.[format]?.fields?.length ?? 0) > 0);
  useEffect(() => {
    if (validPresets.length > 0 && !validPresets.some((p) => p.id === presetId)) setPresetId(validPresets[0].id);
  }, [format, presets]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveImageUrls = async (c: Creative) => {
    const entries = await Promise.all(
      c.slides
        .filter((s) => s.image_url)
        .map(async (s) => {
          const { data } = await supabase.storage.from("instagram-creatives").createSignedUrl(s.image_url!, 3600);
          return [s.image_url!, data?.signedUrl ?? ""] as const;
        }),
    );
    setImageUrls(Object.fromEntries(entries));
  };

  const generate = async () => {
    if (!campanhaId || !itemId || !presetId) return toast.error("Selecione campanha, item e preset");
    setGenerating(true);
    setCreative(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-creative", {
        body: { campanha_id: campanhaId, campanha_item_id: itemId, format, preset_id: presetId },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx && typeof ctx.text === "function" ? await ctx.text().catch(() => "") : "";
        let detail = error.message;
        try {
          detail = body ? JSON.parse(body).error ?? detail : detail;
        } catch {
          if (body) detail = body;
        }
        throw new Error(detail);
      }
      const result = data as { run_id: string };
      setRunId(result.run_id);
      const { data: rows } = await db.from("instagram_creatives").select("*").eq("run_id", result.run_id).limit(1);
      const c = (rows ?? [])[0] as Creative | undefined;
      if (c) {
        setCreative(c);
        await resolveImageUrls(c);
      }
      toast.success("Criativo gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const approve = async () => {
    if (!creative) return;
    setApproving(true);
    try {
      const finalUrls: string[] = [];
      for (let i = 0; i < creative.slides.length; i++) {
        const node = exportRefs.current[i];
        if (!node) continue;
        const blob = await toBlob(node, { pixelRatio: 1, cacheBust: true });
        if (!blob) continue;
        const path = `${creative.id}/final-${creative.slides[i].order}.png`;
        const { error: upErr } = await supabase.storage.from("instagram-creatives").upload(path, blob, { upsert: true, contentType: "image/png" });
        if (upErr) throw upErr;
        finalUrls.push(path);
      }
      const { error } = await db.from("instagram_creatives").update({ status: "approved", final_image_urls: finalUrls, reviewed_by: user?.id, reviewed_at: new Date().toISOString() }).eq("id", creative.id);
      if (error) throw error;
      setCreative({ ...creative, status: "approved", final_image_urls: finalUrls });
      toast.success("Aprovado — pronto para baixar");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  const download = async (path: string, i: number) => {
    const { data } = await supabase.storage.from("instagram-creatives").createSignedUrl(path, 60);
    if (data) window.open(data.signedUrl, "_blank");
  };

  const activeSpec = presets.find((p) => p.id === presetId)?.template_spec?.[format];

  useEffect(() => {
    if (!activeSpec?.backgroundPath) return setBackgroundUrl(null);
    supabase.storage
      .from("preset-assets")
      .createSignedUrl(activeSpec.backgroundPath, 3600)
      .then(({ data }) => setBackgroundUrl(data?.signedUrl ?? null));
  }, [activeSpec?.backgroundPath]);

  if (loading) return <Loader2 className="w-6 h-6 animate-spin m-8" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to={casaSlugHint ? `/casa/${casaSlugHint}` : "/"}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-xl font-bold">Gerar criativo</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6 max-w-3xl">
        {casasAcessiveis.length > 1 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Casa</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {casasAcessiveis.map((c) => (
                <Button key={c.id} variant={casaId === c.id ? "default" : "outline"} onClick={() => setCasaId(c.id)}>
                  {c.nome}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {casa && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{casa.nome}</CardTitle>
              <CardDescription>Escolha campanha, item e formato — a arte segue exatamente o preset já pronto.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium">Campanha / área de serviço</label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)}>
                  <option value="">Selecione</option>
                  {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              {campanhaId && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">{campanhas.find((c) => c.id === campanhaId)?.escopo === "por_unidade" ? "Unidade" : "Serviço"}</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                    <option value="">Selecione</option>
                    {itens.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
                  </select>
                  {itens.length === 0 && <p className="text-xs text-muted-foreground">Nenhum item disponível para você nesta campanha.</p>}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium">Formato</label>
                <div className="flex gap-2">
                  {FORMATS.map((f) => (
                    <Button key={f.id} size="sm" variant={format === f.id ? "default" : "outline"} onClick={() => setFormat(f.id)}>{f.label}</Button>
                  ))}
                </div>
              </div>

              {validPresets.length > 1 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Preset</label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                    {validPresets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              {validPresets.length === 0 && (
                <p className="text-xs text-destructive">Nenhum preset com esse formato configurado ainda para esta Casa — peça ao designer para montar um em Admin → Presets.</p>
              )}

              <Button onClick={generate} disabled={generating || !campanhaId || !itemId || validPresets.length === 0} className="w-full">
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                Gerar
              </Button>
            </CardContent>
          </Card>
        )}

        {creative && activeSpec && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prévia</CardTitle>
              <CardDescription>{creative.caption}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 overflow-x-auto pb-2">
                {creative.slides.map((slide, i) => (
                  <div key={i} className="shrink-0">
                    <TemplateRenderer
                      spec={activeSpec}
                      values={slide.values}
                      backgroundUrl={backgroundUrl}
                      imageUrl={slide.image_url ? imageUrls[slide.image_url] : undefined}
                      previewWidth={240}
                    />
                    {/* nó em resolução completa, fora da tela, usado só pra exportar o PNG final */}
                    <div style={{ position: "fixed", left: -20000, top: 0 }}>
                      <TemplateRenderer
                        ref={(el) => (exportRefs.current[i] = el)}
                        spec={activeSpec}
                        values={slide.values}
                        backgroundUrl={backgroundUrl}
                        imageUrl={slide.image_url ? imageUrls[slide.image_url] : undefined}
                        previewWidth={1080}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={approve} disabled={approving || creative.status === "approved"}>
                  {approving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Aprovar
                </Button>
                <Button variant="outline" onClick={generate}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Gerar de novo
                </Button>
                {creative.status === "approved" &&
                  creative.final_image_urls.map((path, i) => (
                    <Button key={path} variant="secondary" onClick={() => download(path, i)}>
                      <Download className="w-4 h-4 mr-2" /> Baixar {creative.slides.length > 1 ? `#${i + 1}` : ""}
                    </Button>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Gerar;
