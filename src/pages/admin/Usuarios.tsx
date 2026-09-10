import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

// casa_members/user_units/unidades ainda não estão no types.ts gerado.
const db = supabase as any;

type CasaRole = "designer" | "social_media" | "gestor";

interface MemberRow {
  id: string;
  user_id: string;
  role: CasaRole;
  profiles: { email: string; display_name: string | null } | null;
}
interface UnitLinkRow {
  id: string;
  user_id: string;
  unidade_id: string;
  unidades: { nome: string; cidade: string } | null;
  profiles: { email: string; display_name: string | null } | null;
}
interface Unidade {
  id: string;
  nome: string;
  cidade: string;
}

const ROLE_LABEL: Record<CasaRole, string> = { designer: "Designer", social_media: "Social media", gestor: "Gestor" };

const AdminUsuarios = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { loading, hasCasaRole, isPlatformAdmin, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [units, setUnits] = useState<Unidade[]>([]);
  const [unitLinks, setUnitLinks] = useState<UnitLinkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [newMember, setNewMember] = useState({ user_id: "", role: "social_media" as CasaRole });
  const [newLink, setNewLink] = useState({ user_id: "", unidade_id: "" });

  const canManage = casa ? isPlatformAdmin || hasCasaRole(casa.id, "gestor") : false;

  const load = useCallback(async () => {
    if (!casa) return;
    const [{ data: m }, { data: u }, { data: ul }] = await Promise.all([
      db.from("casa_members").select("id, user_id, role, profiles(email, display_name)").eq("casa_id", casa.id),
      db.from("unidades").select("id, nome, cidade").eq("casa_id", casa.id).order("nome"),
      db
        .from("user_units")
        .select("id, user_id, unidade_id, unidades!inner(nome, cidade, casa_id), profiles(email, display_name)")
        .eq("unidades.casa_id", casa.id),
    ]);
    setMembers((m ?? []) as MemberRow[]);
    setUnits((u ?? []) as Unidade[]);
    setUnitLinks((ul ?? []) as UnitLinkRow[]);
  }, [casa]);

  useEffect(() => {
    if (casa) load();
  }, [casa, load]);

  useEffect(() => {
    if (!loading && casa && !canManage) navigate("/admin", { replace: true });
  }, [loading, casa, canManage, navigate]);

  const addMember = async () => {
    if (!casa || !newMember.user_id.trim()) return toast.error("Informe o ID do usuário");
    setBusy(true);
    const { error } = await db
      .from("casa_members")
      .insert({ casa_id: casa.id, user_id: newMember.user_id.trim(), role: newMember.role });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewMember({ user_id: "", role: "social_media" });
    toast.success("Membro adicionado");
    await load();
  };

  const removeMember = async (id: string) => {
    const { error } = await db.from("casa_members").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  };

  const addLink = async () => {
    if (!newLink.user_id.trim() || !newLink.unidade_id) return toast.error("Informe o ID do usuário e a unidade");
    setBusy(true);
    const { error } = await db.from("user_units").insert({ user_id: newLink.user_id.trim(), unidade_id: newLink.unidade_id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewLink({ user_id: "", unidade_id: "" });
    toast.success("Vínculo criado");
    await load();
  };

  const removeLink = async (id: string) => {
    const { error } = await db.from("user_units").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await load();
  };

  if (loading || !casa) return <Loader2 className="w-6 h-6 animate-spin m-8" />;
  if (!canManage) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-xl font-bold">Usuários — {casa.nome}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Time de marketing da Casa</CardTitle>
            <CardDescription>
              Designer tem acesso total (alimenta biblioteca e presets). Social media só gera cards. Cole o ID do
              usuário (UUID do Supabase Auth) — ainda não há busca por e-mail nesta versão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.profiles?.email ?? m.user_id}</TableCell>
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
            <div className="grid sm:grid-cols-3 gap-2 items-end pt-4 border-t border-border">
              <div className="space-y-1">
                <Label className="text-xs">ID do usuário</Label>
                <Input value={newMember.user_id} onChange={(e) => setNewMember((p) => ({ ...p, user_id: e.target.value }))} placeholder="uuid" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Papel</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={newMember.role}
                  onChange={(e) => setNewMember((p) => ({ ...p, role: e.target.value as CasaRole }))}
                >
                  <option value="social_media">Social media</option>
                  <option value="designer">Designer</option>
                  <option value="gestor">Gestor</option>
                </select>
              </div>
              <Button onClick={addMember} disabled={busy}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendedores/autorizados por unidade</CardTitle>
            <CardDescription>
              Cada usuário só vê e gera cards da(s) unidade(s) vinculada(s) aqui, sempre com presets já prontos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {unitLinks.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{l.profiles?.email ?? l.user_id}</TableCell>
                    <TableCell>{l.unidades ? `${l.unidades.nome} — ${l.unidades.cidade}` : l.unidade_id}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => removeLink(l.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="grid sm:grid-cols-3 gap-2 items-end pt-4 border-t border-border">
              <div className="space-y-1">
                <Label className="text-xs">ID do usuário</Label>
                <Input value={newLink.user_id} onChange={(e) => setNewLink((p) => ({ ...p, user_id: e.target.value }))} placeholder="uuid" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade</Label>
                <select
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={newLink.unidade_id}
                  onChange={(e) => setNewLink((p) => ({ ...p, unidade_id: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome} — {u.cidade}</option>
                  ))}
                </select>
              </div>
              <Button onClick={addLink} disabled={busy}><Plus className="w-4 h-4 mr-1" /> Vincular</Button>
            </div>
            {units.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma unidade cadastrada ainda — crie em Campanhas/Unidades.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminUsuarios;
