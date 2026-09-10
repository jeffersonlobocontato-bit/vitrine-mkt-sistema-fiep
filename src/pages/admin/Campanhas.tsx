import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ArrowLeft, Plus, Trash2, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// casas/casa_members/unidades/campanhas/campanha_itens ainda não estão no types.ts gerado.
const db = supabase as any;

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

interface Unidade {
  id: string;
  nome: string;
  cidade: string;
  estado: string | null;
  contatos: { telefone?: string; whatsapp?: string; email?: string };
  ativo: boolean;
}
interface Campanha {
  id: string;
  nome: string;
  slug: string;
  escopo: "por_unidade" | "geral";
  ativo: boolean;
}
interface CampanhaItem {
  id: string;
  campanha_id: string;
  unidade_id: string | null;
  nome: string;
  dados: Record<string, string>;
  ativo: boolean;
}

const AdminCampanhas = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { loading, hasCasaRole, isPlatformAdmin, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);
  const canManage = casa ? isPlatformAdmin || hasCasaRole(casa.id, "designer") || hasCasaRole(casa.id, "gestor") : false;

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [itensByCampanha, setItensByCampanha] = useState<Record<string, CampanhaItem[]>>({});
  const [openCampanha, setOpenCampanha] = useState<string | null>(null);

  const [newUnidade, setNewUnidade] = useState({ nome: "", cidade: "", estado: "", telefone: "" });
  const [newCampanha, setNewCampanha] = useState({ nome: "", escopo: "geral" as Campanha["escopo"] });
  const [newItem, setNewItem] = useState<Record<string, { nome: string; unidade_id: string; preco: string; condicoes: string; contato: string; descricao: string }>>({});

  const load = useCallback(async () => {
    if (!casa) return;
    const [{ data: u }, { data: c }] = await Promise.all([
      db.from("unidades").select("*").eq("casa_id", casa.id).order("nome"),
      db.from("campanhas").select("*").eq("casa_id", casa.id).order("nome"),
    ]);
    setUnidades((u ?? []) as Unidade[]);
    setCampanhas((c ?? []) as Campanha[]);
  }, [casa]);

  useEffect(() => {
    if (casa) load();
  }, [casa, load]);

  useEffect(() => {
    if (!loading && casa && !canManage) navigate("/admin", { replace: true });
  }, [loading, casa, canManage, navigate]);

  const loadItens = async (campanhaId: string) => {
    const { data } = await db.from("campanha_itens").select("*").eq("campanha_id", campanhaId).order("nome");
    setItensByCampanha((prev) => ({ ...prev, [campanhaId]: (data ?? []) as CampanhaItem[] }));
  };

  const toggleCampanha = (id: string) => {
    const next = openCampanha === id ? null : id;
    setOpenCampanha(next);
    if (next) loadItens(next);
  };

  const addUnidade = async () => {
    if (!casa || !newUnidade.nome.trim() || !newUnidade.cidade.trim()) return toast.error("Preencha nome e cidade");
    const { error } = await db.from("unidades").insert({
      casa_id: casa.id,
      nome: newUnidade.nome.trim(),
      cidade: newUnidade.cidade.trim(),
      estado: newUnidade.estado.trim() || null,
      contatos: newUnidade.telefone.trim() ? { telefone: newUnidade.telefone.trim() } : {},
    });
    if (error) return toast.error(error.message);
    setNewUnidade({ nome: "", cidade: "", estado: "", telefone: "" });
    toast.success("Unidade criada");
    await load();
  };

  const toggleUnidadeAtiva = async (u: Unidade) => {
    await db.from("unidades").update({ ativo: !u.ativo }).eq("id", u.id);
    await load();
  };

  const removeUnidade = async (id: string) => {
    const { error } = await db.from("unidades").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  };

  const addCampanha = async () => {
    if (!casa || !newCampanha.nome.trim()) return toast.error("Informe o nome da campanha");
    const { error } = await db.from("campanhas").insert({
      casa_id: casa.id,
      nome: newCampanha.nome.trim(),
      slug: slugify(newCampanha.nome),
      escopo: newCampanha.escopo,
    });
    if (error) return toast.error(error.message);
    setNewCampanha({ nome: "", escopo: "geral" });
    toast.success("Campanha criada");
    await load();
  };

  const toggleCampanhaAtiva = async (c: Campanha) => {
    await db.from("campanhas").update({ ativo: !c.ativo }).eq("id", c.id);
    await load();
  };

  const addItem = async (campanha: Campanha) => {
    const form = newItem[campanha.id] ?? { nome: "", unidade_id: "", preco: "", condicoes: "", contato: "", descricao: "" };
    if (!form.nome.trim()) return toast.error("Informe o nome do item");
    if (campanha.escopo === "por_unidade" && !form.unidade_id) return toast.error("Selecione a unidade");
    const dados =
      campanha.escopo === "por_unidade"
        ? { preco: form.preco, condicoes: form.condicoes, contato: form.contato }
        : { descricao: form.descricao };
    const { error } = await db.from("campanha_itens").insert({
      campanha_id: campanha.id,
      unidade_id: campanha.escopo === "por_unidade" ? form.unidade_id : null,
      nome: form.nome.trim(),
      dados,
    });
    if (error) return toast.error(error.message);
    setNewItem((prev) => ({ ...prev, [campanha.id]: { nome: "", unidade_id: "", preco: "", condicoes: "", contato: "", descricao: "" } }));
    toast.success("Item adicionado");
    await loadItens(campanha.id);
  };

  const removeItem = async (campanhaId: string, itemId: string) => {
    const { error } = await db.from("campanha_itens").delete().eq("id", itemId);
    if (error) return toast.error(error.message);
    await loadItens(campanhaId);
  };

  if (loading || !casa) return <Loader2 className="w-6 h-6 animate-spin m-8" />;
  if (!canManage) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/casa/${casa.slug}`}><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <h1 className="text-xl font-bold">Campanhas — {casa.nome}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild><Link to={`/admin/${casa.slug}/presets`}>Presets</Link></Button>
            <Button variant="outline" asChild><Link to={`/admin/${casa.slug}/usuarios`}>Usuários</Link></Button>
            <Button variant="outline" asChild><Link to={`/admin/${casa.slug}/publicacao`}>Publicação</Link></Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unidades</CardTitle>
            <CardDescription>
              Estrutura pronta para receber a lista real de cidades/unidades por upload de planilha depois. Por
              enquanto, cadastro manual.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unidades.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.nome}</TableCell>
                    <TableCell>{u.cidade}{u.estado ? ` — ${u.estado}` : ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.contatos?.telefone ?? "—"}</TableCell>
                    <TableCell><Switch checked={u.ativo} onCheckedChange={() => toggleUnidadeAtiva(u)} /></TableCell>
                    <TableCell className="flex gap-1">
                      <Button size="sm" variant="ghost" asChild title="Documento com o diferencial desta unidade (preço, condições etc.)">
                        <Link to={`/admin/${casa.slug}/biblioteca?unidade=${u.id}`}>Documento</Link>
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeUnidade(u.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="grid sm:grid-cols-5 gap-2 items-end pt-4 border-t border-border">
              <div className="space-y-1"><Label className="text-xs">Nome</Label><Input value={newUnidade.nome} onChange={(e) => setNewUnidade((p) => ({ ...p, nome: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Cidade</Label><Input value={newUnidade.cidade} onChange={(e) => setNewUnidade((p) => ({ ...p, cidade: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">UF</Label><Input value={newUnidade.estado} onChange={(e) => setNewUnidade((p) => ({ ...p, estado: e.target.value }))} maxLength={2} /></div>
              <div className="space-y-1"><Label className="text-xs">Telefone</Label><Input value={newUnidade.telefone} onChange={(e) => setNewUnidade((p) => ({ ...p, telefone: e.target.value }))} /></div>
              <Button onClick={addUnidade}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campanhas / áreas de serviço</CardTitle>
            <CardDescription>
              "Por unidade" (ex.: Matrículas) gera um item por unidade com preço/condições/contato próprios. "Geral"
              (ex.: portfólio Sesi Saúde) gera itens de serviço, sem amarrar a uma unidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {campanhas.map((c) => {
              const itens = itensByCampanha[c.id] ?? [];
              const form = newItem[c.id] ?? { nome: "", unidade_id: "", preco: "", condicoes: "", contato: "", descricao: "" };
              return (
                <Collapsible key={c.id} open={openCampanha === c.id} onOpenChange={() => toggleCampanha(c.id)} className="border rounded-md overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <ChevronRight className={`w-4 h-4 transition-transform ${openCampanha === c.id ? "rotate-90" : ""}`} />
                        <span className="font-medium">{c.nome}</span>
                        <Badge variant="outline">{c.escopo === "por_unidade" ? "Por unidade" : "Geral"}</Badge>
                      </div>
                      <Switch checked={c.ativo} onCheckedChange={(e) => { toggleCampanhaAtiva(c); }} onClick={(e) => e.stopPropagation()} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-4 pb-4 pt-0 border-t space-y-3">
                    <div className="flex gap-2 pt-3">
                      <Button size="sm" variant="outline" asChild>
                        <Link to={`/admin/${casa.slug}/biblioteca?campanha=${c.id}`}>Biblioteca RAG da campanha</Link>
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>{c.escopo === "por_unidade" ? "Unidade" : "Descrição"}</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell className="font-medium">{it.nome}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {c.escopo === "por_unidade"
                                ? unidades.find((u) => u.id === it.unidade_id)?.nome ?? "—"
                                : it.dados?.descricao ?? "—"}
                            </TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" onClick={() => removeItem(c.id, it.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="grid sm:grid-cols-2 gap-2">
                      <Input placeholder="Nome do item" value={form.nome} onChange={(e) => setNewItem((p) => ({ ...p, [c.id]: { ...form, nome: e.target.value } }))} />
                      {c.escopo === "por_unidade" ? (
                        <select
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          value={form.unidade_id}
                          onChange={(e) => setNewItem((p) => ({ ...p, [c.id]: { ...form, unidade_id: e.target.value } }))}
                        >
                          <option value="">Selecione a unidade</option>
                          {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                        </select>
                      ) : (
                        <Input placeholder="Descrição do serviço" value={form.descricao} onChange={(e) => setNewItem((p) => ({ ...p, [c.id]: { ...form, descricao: e.target.value } }))} />
                      )}
                      {c.escopo === "por_unidade" && (
                        <>
                          <Input placeholder="Preço" value={form.preco} onChange={(e) => setNewItem((p) => ({ ...p, [c.id]: { ...form, preco: e.target.value } }))} />
                          <Input placeholder="Condições" value={form.condicoes} onChange={(e) => setNewItem((p) => ({ ...p, [c.id]: { ...form, condicoes: e.target.value } }))} />
                          <Input placeholder="Contato" value={form.contato} onChange={(e) => setNewItem((p) => ({ ...p, [c.id]: { ...form, contato: e.target.value } }))} />
                        </>
                      )}
                    </div>
                    <Button size="sm" onClick={() => addItem(c)}><Plus className="w-4 h-4 mr-1" /> Adicionar item</Button>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            <div className="grid sm:grid-cols-3 gap-2 items-end pt-4 border-t border-border">
              <div className="space-y-1"><Label className="text-xs">Nome da campanha</Label><Input value={newCampanha.nome} onChange={(e) => setNewCampanha((p) => ({ ...p, nome: e.target.value }))} /></div>
              <div className="space-y-1">
                <Label className="text-xs">Escopo</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={newCampanha.escopo}
                  onChange={(e) => setNewCampanha((p) => ({ ...p, escopo: e.target.value as Campanha["escopo"] }))}
                >
                  <option value="geral">Geral (portfólio de serviço)</option>
                  <option value="por_unidade">Por unidade (ex.: matrículas)</option>
                </select>
              </div>
              <Button onClick={addCampanha}><Plus className="w-4 h-4 mr-1" /> Criar campanha</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminCampanhas;
