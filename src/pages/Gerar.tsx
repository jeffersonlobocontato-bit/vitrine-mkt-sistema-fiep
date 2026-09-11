import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toBlob } from "html-to-image";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft, Sparkles, Check, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TemplateRenderer, type FormatTemplateSpec, type ImagePosition } from "@/components/TemplateRenderer";

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
interface Item { id: string; nome: string; unidade_id: string | null; ativo: boolean; dados: Record<string, unknown> }
interface Preset { id: string; name: string; template_spec: Partial<Record<Format, FormatTemplateSpec>> }

const CONTACT_LABELS: Record<string, string> = { telefone: "Telefone", whatsapp: "WhatsApp", email: "E-mail", endereco: "Endereço" };
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
  const [contactOptions, setContactOptions] = useState<Record<string, string>>({});
  const [contactKeys, setContactKeys] = useState<string[]>([]);
  const [brief, setBrief] = useState("");
  const [generating, setGenerating] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [creative, setCreative] = useState<Creative | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  // Enquadramento da foto dentro do slot por slide (índice) — máscara tipo Canva/Adobe: o
  // usuário arrasta a foto por dentro do container fixo. Sem entrada aqui, cai no centro (50/50).
  const [imagePositions, setImagePositions] = useState<Record<number, ImagePosition>>({});
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [stickerUrls, setStickerUrls] = useState<Record<string, string>>({});
  const [fontUrl, setFontUrl] = useState<string | null>(null);
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
    db.from("campanha_itens").select("id, nome, unidade_id, ativo, dados").eq("campanha_id", campanhaId).eq("ativo", true).order("nome").then(({ data }: any) => setItens((data ?? []) as Item[]));
    setItemId("");
  }, [campanhaId]);

  useEffect(() => {
    const item = itens.find((i) => i.id === itemId);
    if (!item) return setContactOptions({});
    (async () => {
      let source: Record<string, string> = {};
      if (item.unidade_id) {
        const { data } = await db.from("unidades").select("contatos").eq("id", item.unidade_id).single();
        source = (data?.contatos as Record<string, string>) ?? {};
      } else {
        source = (item.dados?.contato_geral as Record<string, string>) ?? {};
      }
      setContactOptions(source);
      setContactKeys(Object.keys(source));
    })();
  }, [itemId, itens]);

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
    setImagePositions({});
    try {
      const { data, error } = await supabase.functions.invoke("generate-creative", {
        body: { campanha_id: campanhaId, campanha_item_id: itemId, format, preset_id: presetId, contact_keys: contactKeys, brief: brief.trim() || undefined },
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
      const result = data as { run_id: string; warnings?: string[] };
      setRunId(result.run_id);
      (result.warnings ?? []).forEach((w) => toast.warning(w));
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
    if (creative && user) await db.from("creative_downloads").insert({ creative_id: creative.id, user_id: user.id, casa_id: casaId });
  };

  const activeSpec = presets.find((p) => p.id === presetId)?.template_spec?.[format];

  useEffect(() => {
    const paths = activeSpec?.backgroundPaths;
    // A arte marcada no editor (backgroundPath) é a que o designer usou pra posicionar os
    // marcadores — ela tem prioridade. Só quando o preset não tem essa arte definida é que
    // sorteamos uma variação do pacote (antes o sorteio vinha primeiro e a arte final saía
    // com layout diferente do setup, jogando texto e foto pra fora do lugar).
    const chosen = activeSpec?.backgroundPath ?? (paths && paths.length > 0 ? paths[Math.floor(Math.random() * paths.length)] : undefined);
    if (!chosen) return setBackgroundUrl(null);
    supabase.storage.from("preset-assets").createSignedUrl(chosen, 3600).then(({ data }) => setBackgroundUrl(data?.signedUrl ?? null));
  }, [activeSpec?.backgroundPath, activeSpec?.backgroundPaths]);

  useEffect(() => {
    const framePath = activeSpec?.imageSlot?.framePath;
    if (!framePath) return setFrameUrl(null);
    supabase.storage.from("preset-assets").createSignedUrl(framePath, 3600).then(({ data }) => setFrameUrl(data?.signedUrl ?? null));
  }, [activeSpec?.imageSlot?.framePath]);

  useEffect(() => {
    const maskPath = activeSpec?.imageSlot?.maskPath;
    if (!maskPath) return setMaskUrl(null);
    supabase.storage.from("preset-assets").createSignedUrl(maskPath, 3600).then(({ data }) => setMaskUrl(data?.signedUrl ?? null));
  }, [activeSpec?.imageSlot?.maskPath]);

  useEffect(() => {
    const stickers = activeSpec?.stickers ?? [];
    if (stickers.length === 0) return setStickerUrls({});
    Promise.all(
      stickers.map(async (s) => {
        const { data } = await supabase.storage.from("preset-assets").createSignedUrl(s.path, 3600);
        return [s.key, data?.signedUrl ?? ""] as const;
      }),
    ).then((entries) => setStickerUrls(Object.fromEntries(entries)));
  }, [activeSpec?.stickers]);

  useEffect(() => {
    const fontPath = activeSpec?.fontPath;
    if (!fontPath) return setFontUrl(null);
    supabase.storage.from("preset-assets").createSignedUrl(fontPath, 3600).then(({ data }) => setFontUrl(data?.signedUrl ?? null));
  }, [activeSpec?.fontPath]);

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

              {activeSpec?.fields.some((f) => f.dataBound) && Object.keys(contactOptions).length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Contato a exibir no card</label>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(contactOptions).map(([key, value]) => (
                      <label key={key} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={contactKeys.includes(key)}
                          onChange={(e) =>
                            setContactKeys((prev) => (e.target.checked ? [...prev, key] : prev.filter((k) => k !== key)))
                          }
                        />
                        {CONTACT_LABELS[key] ?? key}: {value}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium">Foco desta geração (opcional)</label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-16"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder='Ex.: "foque no risco psicossocial" ou "fale com o SESI no (45) 99986-4017" — o WhatsApp digitado aqui entra no CTA do rodapé; o resto direciona só o texto, nunca o layout nem as regras da campanha.'
                />
              </div>

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
                      frameUrl={frameUrl}
                      maskUrl={maskUrl}
                      stickerUrls={stickerUrls}
                      fontUrl={fontUrl}
                      previewWidth={240}
                      imagePosition={imagePositions[i]}
                      onImagePositionChange={slide.image_url ? (pos) => setImagePositions((prev) => ({ ...prev, [i]: pos })) : undefined}
                    />
                    {activeSpec.imageSlot && slide.image_url && (
                      <div className="mt-1 space-y-1">
                        <div className="flex items-center justify-center gap-1">
                          {/* zoom da foto DENTRO da moldura (o quadro nunca muda) — igual Canva */}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2"
                            onClick={() =>
                              setImagePositions((prev) => {
                                const cur = prev[i] ?? { x: 50, y: 50, zoom: 1 };
                                return { ...prev, [i]: { ...cur, zoom: Math.max(1, (cur.zoom ?? 1) - 0.1) } };
                              })
                            }
                          >
                            −
                          </Button>
                          <span className="text-[10px] text-muted-foreground w-10 text-center">
                            {Math.round((imagePositions[i]?.zoom ?? 1) * 100)}%
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2"
                            onClick={() =>
                              setImagePositions((prev) => {
                                const cur = prev[i] ?? { x: 50, y: 50, zoom: 1 };
                                return { ...prev, [i]: { ...cur, zoom: Math.min(4, (cur.zoom ?? 1) + 0.1) } };
                              })
                            }
                          >
                            +
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center">Arraste a foto e use a roda do mouse pra ajustar dentro da moldura</p>
                      </div>
                    )}
                    {/* nó em resolução completa, fora da tela, usado só pra exportar o PNG final —
                        sem onImagePositionChange (não é arrastável), só herda a posição escolhida
                        na prévia acima (mesmo estado imagePositions[i]). */}
                    <div style={{ position: "fixed", left: -20000, top: 0 }}>
                      <TemplateRenderer
                        ref={(el) => (exportRefs.current[i] = el)}
                        spec={activeSpec}
                        values={slide.values}
                        backgroundUrl={backgroundUrl}
                        imageUrl={slide.image_url ? imageUrls[slide.image_url] : undefined}
                        frameUrl={frameUrl}
                        maskUrl={maskUrl}
                        stickerUrls={stickerUrls}
                        fontUrl={fontUrl}
                        previewWidth={1080}
                        imagePosition={imagePositions[i]}
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
