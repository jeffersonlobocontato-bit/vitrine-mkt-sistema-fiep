import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso, type CasaRole } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Plus, Trash2, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

// casa_members/user_units/unidades/profiles ainda não estão totalmente no types.ts gerado.
const db = supabase as any;

interface MemberRow { id: string; user_id: string; casa_id: string; role: CasaRole }
interface UnitLinkRow { id: string; user_id: string; unidade_id: string }
interface Unidade { id: string; casa_id: string; nome: string; cidade: string }
interface Profile { id: string; email: string }

const ROLE_LABEL: Record<CasaRole, string> = { designer: "Designer (total)", social_media: "Social media (gerar criativos)", gestor: "Gestor" };

const AdminUsuarios = () => {
  const navigate = useNavigate();
  const { loading, isPlatformAdmin, casaMemberships, casas } = useCasaAcesso();

  const manageableCasas = isPlatformAdmin
    ? casas
    : casas.filter((c) => casaMemberships.some((m) => m.casa_id === c.id && m.role === "gestor"));
  const canView = isPlatformAdmin || manageableCasas.length > 0;

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unitLinks, setUnitLinks] = useState<UnitLinkRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const [scope, setScope] = useState<"casas" | "unidade">("casas");
  const [email, setEmail] = useState("");
  const [selectedCasaIds, setSelectedCasaIds] = useState<string[]>([]);
  const [role, setRole] = useState<CasaRole>("social_media");
  const [selectedUnidadeId, setSelectedUnidadeId] = useState("");

  const load = useCallback(async () => {
    const casaIds = manageableCasas.map((c) => c.id);
    if (casaIds.length === 0) return;
    const [{ data: m }, { data: u }] = await Promise.all([
      db.from("casa_members").select("id, user_id, casa_id, role").in("casa_id", casaIds),
      db.from("unidades").select("id, casa_id, nome, cidade").in("casa_id", casaIds).order("nome"),
    ]);
    setMembers((m ?? []) as MemberRow[]);
    setUnidades((u ?? []) as Unidade[]);

    const unidadeIds = ((u ?? []) as Unidade[]).map((x) => x.id);
    const { data: ul } = unidadeIds.length
      ? await db.from("user_units").select("id, user_id, unidade_id").in("unidade_id", unidadeIds)
      : { data: [] };
    setUnitLinks((ul ?? []) as UnitLinkRow[]);

    const userIds = [...new Set([...(m ?? []).map((x: MemberRow) => x.user_id), ...((ul ?? []) as UnitLinkRow[]).map((x) => x.user_id)])];
    if (userIds.length > 0) {
      const { data: p } = await db.from("profiles").select("id, email").in("id", userIds);
      setProfiles(Object.fromEntries(((p ?? []) as Profile[]).map((x) => [x.id, x.email])));
    }
  }, [manageableCasas]);

  useEffect(() => {
    if (!loading) load();
  }, [loading, load]);

  useEffect(() => {
    if (!loading && !canView) navigate("/", { replace: true });
  }, [loading, canView, navigate]);

  const resolveUserId = async (): Promise<string | null> => {
    if (!email.trim()) {
      toast.error("Informe o e-mail do usuário");
      return null;
    }
    const { data, error } = await db.from("profiles").select("id").eq("email", email.trim()).maybeSingle();
    if (error || !data) {
      toast.error("Usuário não encontrado — ele precisa ter feito login pelo menos uma vez no sistema");
      return null;
    }
    return data.id as string;
  };

  const linkCasas = async () => {
    if (selectedCasaIds.length === 0) return toast.error("Selecione ao menos uma Casa");
    const userId = await resolveUserId();
    if (!userId) return;
    setBusy(true);
    const { error } = await db
      .from("casa_members")
      .upsert(selectedCasaIds.map((casaId) => ({ casa_id: casaId, user_id: userId, role })), { onConflict: "casa_id,user_id" });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEmail("");
    setSelectedCasaIds([]);
    toast.success("Acesso concedido");
    await load();
  };

  const linkUnidade = async () => {
    if (!selectedUnidadeId) return toast.error("Selecione a unidade");
    const userId = await resolveUserId();
    if (!userId) return;
    setBusy(true);
    const { error } = await db.from("user_units").insert({ user_id: userId, unidade_id: selectedUnidadeId });
    setBusy(false);
    if (error) return toast.error(error.message);
    setEmail("");
    setSelectedUnidadeId("");
    toast.success("Vínculo criado");
    await load();
  };

  const removeMember = async (id: string) => {
    const { error } = await db.from("casa_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  };

  const removeLink = async (id: string) => {
    const { error } = await db.from("user_units").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  };

  if (loading || !canView) return <Loader2 className="w-6 h-6 animate-spin m-8" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <UsersIcon className="w-5 h-5" />
          <h1 className="text-xl font-bold">Usuários</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vincular usuário</CardTitle>
            <CardDescription>
              Informe o e-mail (o usuário precisa já ter feito login uma vez) e escolha o acesso: uma ou mais Casas
              com um nível (Designer = total, Social media = só gerar criativos, Gestor = administra a Casa), ou uma
              única unidade (relacionamento/vendas — só gera criativos daquela unidade).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">E-mail do usuário</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
            </div>

            <div className="flex gap-2">
              <Button size="sm" variant={scope === "casas" ? "default" : "outline"} onClick={() => setScope("casas")}>Casa(s)</Button>
              <Button size="sm" variant={scope === "unidade" ? "default" : "outline"} onClick={() => setScope("unidade")}>Unidade (vendas)</Button>
            </div>

            {scope === "casas" ? (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div>
                  <Label className="text-xs font-medium">Casa(s)</Label>
                  <div className="flex flex-wrap gap-3 mt-1">
                    {manageableCasas.map((c) => (
                      <label key={c.id} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedCasaIds.includes(c.id)}
                          onChange={(e) =>
                            setSelectedCasaIds((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                          }
                        />
                        {c.nome}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Nível de acesso</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={role}
                    onChange={(e) => setRole(e.target.value as CasaRole)}
                  >
                    <option value="designer">Designer (total)</option>
                    <option value="social_media">Social media (gerar criativos)</option>
                    <option value="gestor">Gestor</option>
                  </select>
                </div>
                <Button onClick={linkCasas} disabled={busy}><Plus className="w-4 h-4 mr-1" /> Conceder acesso</Button>
              </div>
            ) : (
              <div className="space-y-3 rounded-lg border border-border p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Unidade</Label>
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedUnidadeId}
                    onChange={(e) => setSelectedUnidadeId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {unidades.map((u) => {
                      const casaNome = casas.find((c) => c.id === u.casa_id)?.nome ?? "";
                      return <option key={u.id} value={u.id}>{casaNome} — {u.nome} ({u.cidade})</option>;
                    })}
                  </select>
                  {unidades.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada ainda nas Casas que você gerencia.</p>
                  )}
                </div>
                <Button onClick={linkUnidade} disabled={busy}><Plus className="w-4 h-4 mr-1" /> Vincular à unidade</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {manageableCasas.map((casa) => {
          const casaMembers = members.filter((m) => m.casa_id === casa.id);
          const casaUnidadeIds = unidades.filter((u) => u.casa_id === casa.id).map((u) => u.id);
          const casaLinks = unitLinks.filter((l) => casaUnidadeIds.includes(l.unidade_id));
          if (casaMembers.length === 0 && casaLinks.length === 0) return null;
          return (
            <Card key={casa.id}>
              <CardHeader>
                <CardTitle className="text-base">{casa.nome}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {casaMembers.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Papel</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {casaMembers.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>{profiles[m.user_id] ?? m.user_id}</TableCell>
                          <TableCell><Badge variant="secondary">{ROLE_LABEL[m.role]}</Badge></TableCell>
                          <TableCell>
                            <Button size="icon" variant="ghost" onClick={() => removeMember(m.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {casaLinks.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário (vendas)</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {casaLinks.map((l) => {
                        const u = unidades.find((x) => x.id === l.unidade_id);
                        return (
                          <TableRow key={l.id}>
                            <TableCell>{profiles[l.user_id] ?? l.user_id}</TableCell>
                            <TableCell>{u ? `${u.nome} — ${u.cidade}` : l.unidade_id}</TableCell>
                            <TableCell>
                              <Button size="icon" variant="ghost" onClick={() => removeLink(l.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
};

export default AdminUsuarios;
