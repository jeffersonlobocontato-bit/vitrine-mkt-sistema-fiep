import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Download, Search, RefreshCw, FileText } from "lucide-react";

// casa_id/campanha_id/unidade_id em knowledge_documents ainda não estão no types.ts gerado.
const db = supabase as any;

export const DOC_TYPES: { id: string; label: string }[] = [
  { id: "brand_manual", label: "Manual da marca" },
  { id: "design_system", label: "Design system" },
  { id: "writing_manual", label: "Manual de redação" },
  { id: "copy_semantic", label: "Padrão semântico de copy" },
  { id: "copy_syntactic", label: "Padrão sintático de copy" },
  { id: "copy_lexical", label: "Padrão lexical de copy" },
  { id: "copy_reference", label: "Referência de texto" },
  { id: "policies", label: "Policies" },
  { id: "guardrails", label: "Guardrails" },
];

const labelOf = (id: string) => DOC_TYPES.find((t) => t.id === id)?.label ?? id;

const STATUS: Record<string, { label: string; variant: "secondary" | "outline" | "destructive" | "default" }> = {
  pending: { label: "na fila", variant: "outline" },
  processing: { label: "processando", variant: "secondary" },
  ready: { label: "pronto", variant: "default" },
  failed: { label: "falhou", variant: "destructive" },
};

type Doc = {
  id: string;
  title: string;
  doc_type: string;
  source_type: string;
  storage_path: string | null;
  mime: string | null;
  bytes: number;
  char_count: number;
  status: string;
  error_message: string | null;
  active: boolean;
  preset_id: string | null;
  created_at: string;
};

type Match = { title: string; doc_type: string; content: string; similarity: number };

const humanSize = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

interface KnowledgeLibraryProps {
  presetId?: string | null;
  /** Escopo multi-Casa: quando informado, os documentos ficam restritos/gravados nesse escopo
   * (Casa, opcionalmente campanha e/ou unidade) em vez de globais. */
  casaId?: string | null;
  campanhaId?: string | null;
  unidadeId?: string | null;
}

const KnowledgeLibrary = ({ presetId, casaId, campanhaId, unidadeId }: KnowledgeLibraryProps) => {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("brand_manual");
  const [scope, setScope] = useState<"all" | "preset">("all");
  const [pasted, setPasted] = useState({ title: "", text: "" });
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    let query = db.from("knowledge_documents").select("*").order("created_at", { ascending: false });
    if (casaId) query = query.eq("casa_id", casaId);
    if (campanhaId) query = query.eq("campanha_id", campanhaId);
    if (unidadeId) query = query.eq("unidade_id", unidadeId);
    const { data } = await query;
    setDocs((data ?? []) as unknown as Doc[]);
    setLoading(false);
  }, [casaId, campanhaId, unidadeId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!docs.some((d) => d.status === "processing" || d.status === "pending")) return;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [docs, load]);

  const ingest = async (documentId: string) => {
    const { data, error } = await supabase.functions.invoke("knowledge-ingest", { body: { document_id: documentId } });
    await load();
    if (error) toast.error("Falha ao processar: " + error.message);
    else if ((data as { error?: string })?.error) toast.error((data as { error: string }).error);
    else toast.success("Documento processado e pronto para uso");
  };

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      for (const file of Array.from(files)) {
        const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("knowledge-docs").upload(path, file);
        if (upErr) throw upErr;
        const { data: row, error } = await db
          .from("knowledge_documents")
          .insert({
            title: file.name,
            doc_type: docType,
            source_type: "upload",
            storage_path: path,
            mime: file.type,
            bytes: file.size,
            created_by: user?.id ?? null,
            preset_id: scope === "preset" ? presetId ?? null : null,
            casa_id: casaId ?? null,
            campanha_id: campanhaId ?? null,
            unidade_id: unidadeId ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        await load();
        await ingest((row as { id: string }).id);
      }
    } catch (e) {
      toast.error("Não consegui enviar: " + (e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const savePasted = async () => {
    if (!pasted.title.trim() || pasted.text.trim().length < 40) {
      toast.error("Informe um título e ao menos 40 caracteres de texto");
      return;
    }
    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: row, error } = await db
      .from("knowledge_documents")
      .insert({
        title: pasted.title.trim(),
        doc_type: docType,
        source_type: "pasted",
        raw_text: pasted.text,
        bytes: pasted.text.length,
        created_by: user?.id ?? null,
        preset_id: scope === "preset" ? presetId ?? null : null,
        casa_id: casaId ?? null,
        campanha_id: campanhaId ?? null,
        unidade_id: unidadeId ?? null,
      })
      .select()
      .single();
    setUploading(false);
    if (error) return toast.error(error.message);
    setPasted({ title: "", text: "" });
    await load();
    await ingest((row as { id: string }).id);
  };

  const toggleActive = async (doc: Doc) => {
    const { error } = await supabase.from("knowledge_documents").update({ active: !doc.active }).eq("id", doc.id);
    if (error) return toast.error(error.message);
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, active: !d.active } : d)));
  };

  const changeType = async (doc: Doc, value: string) => {
    const { error } = await supabase.from("knowledge_documents").update({ doc_type: value }).eq("id", doc.id);
    if (error) return toast.error(error.message);
    setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, doc_type: value } : d)));
  };

  const remove = async (doc: Doc) => {
    if (doc.storage_path) await supabase.storage.from("knowledge-docs").remove([doc.storage_path]);
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    setDocs((prev) => prev.filter((d) => d.id !== doc.id));
    toast.success("Documento removido");
  };

  const download = async (doc: Doc) => {
    if (!doc.storage_path) return toast.info("Este item foi colado como texto");
    const { data, error } = await supabase.storage.from("knowledge-docs").createSignedUrl(doc.storage_path, 60);
    if (error || !data) return toast.error("Não consegui abrir o arquivo");
    window.open(data.signedUrl, "_blank");
  };

  const runSearch = async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    const { data, error } = await supabase.functions.invoke("knowledge-search", {
      body: { query, preset_id: presetId ?? null },
    });
    setSearching(false);
    if (error) return toast.error(error.message);
    setMatches(((data as { matches?: Match[] })?.matches ?? []) as Match[]);
  };

  const visible = filter === "all" ? docs : docs.filter((d) => d.doc_type === filter);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar material</CardTitle>
          <CardDescription>
            PDF, Word (.docx) ou texto. PDFs escaneados (sem texto selecionável) não conseguem ser lidos — nesse caso
            cole o texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="doc_type">Tipo do documento</Label>
              <select
                id="doc_type"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scope">Onde vale</Label>
              <select
                id="scope"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={scope}
                onChange={(e) => setScope(e.target.value as "all" | "preset")}
              >
                <option value="all">Todos os presets</option>
                <option value="preset">Somente o preset atual</option>
              </select>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              upload(e.dataTransfer.files);
            }}
            className="rounded-lg border border-dashed border-border p-6 text-center"
          >
            <p className="text-sm text-muted-foreground mb-3">Arraste os arquivos aqui ou escolha do computador</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={(e) => upload(e.target.files)}
            />
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Escolher arquivos
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paste_title">Ou cole o texto</Label>
            <Input
              id="paste_title"
              placeholder="Título do material"
              value={pasted.title}
              onChange={(e) => setPasted({ ...pasted, title: e.target.value })}
            />
            <Textarea
              rows={5}
              placeholder="Cole aqui o conteúdo do manual, policy ou guardrail"
              value={pasted.text}
              onChange={(e) => setPasted({ ...pasted, text: e.target.value })}
            />
            <Button variant="outline" size="sm" onClick={savePasted} disabled={uploading}>
              <FileText className="w-4 h-4 mr-2" /> Salvar texto
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base">Materiais da plataforma</CardTitle>
              <CardDescription>Desativados deixam de influenciar as gerações.</CardDescription>
            </div>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">Todos os tipos</option>
              {DOC_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum material ainda.</p>
          ) : (
            visible.map((d) => {
              const st = STATUS[d.status] ?? STATUS.pending;
              return (
                <div key={d.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Switch checked={d.active} onCheckedChange={() => toggleActive(d)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {labelOf(d.doc_type)} · {humanSize(d.bytes)} ·{" "}
                        {new Date(d.created_at).toLocaleDateString("pt-BR")}
                        {d.char_count > 0 && ` · ${d.char_count.toLocaleString("pt-BR")} caracteres`}
                        {d.preset_id ? " · só este preset" : ""}
                      </p>
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <select
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={d.doc_type}
                      onChange={(e) => changeType(d, e.target.value)}
                    >
                      {DOC_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <Button variant="ghost" size="icon" onClick={() => ingest(d.id)} title="Reprocessar">
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => download(d)} title="Abrir arquivo">
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(d)} title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {d.error_message && <p className="text-xs text-destructive">{d.error_message}</p>}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Testar a busca</CardTitle>
          <CardDescription>Digite um tema e veja quais trechos o agente usaria.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Ex.: tom de voz para lançamento de IA"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
            <Button onClick={runSearch} disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          {matches && matches.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum trecho encontrado.</p>
          )}
          {matches?.map((m, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground mb-1">
                {m.title} · {labelOf(m.doc_type)} · {(m.similarity * 100).toFixed(0)}% de aderência
              </p>
              <p className="text-sm whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default KnowledgeLibrary;
