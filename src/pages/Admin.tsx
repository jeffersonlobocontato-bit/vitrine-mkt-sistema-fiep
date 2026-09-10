import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, LogOut, Sparkles, Plus, Images } from "lucide-react";
import { CreativeReviewCard, type Creative } from "@/components/CreativeReviewCard";

type Run = {
  id: string;
  run_date: string;
  status: string;
  topic_title: string | null;
  topic_summary: string | null;
  error_message: string | null;
};

type Source = {
  id: string;
  name: string;
  url: string;
  active: boolean;
  last_fetch_status: string | null;
};

const Admin = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [generating, setGenerating] = useState(false);
  const [newSource, setNewSource] = useState({ name: "", url: "" });

  const load = useCallback(async () => {
    const [{ data: runsData }, { data: creativesData }, { data: sourcesData }] = await Promise.all([
      supabase.from("instagram_runs").select("*").order("created_at", { ascending: false }).limit(10),
      supabase.from("instagram_creatives").select("*").order("created_at", { ascending: false }).limit(30),
      supabase.from("instagram_trend_sources").select("*").order("created_at"),
    ]);
    setRuns((runsData ?? []) as Run[]);
    setCreatives((creativesData ?? []) as unknown as Creative[]);
    setSources((sourcesData ?? []) as Source[]);
  }, []);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth", { replace: true });
        return;
      }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (!active) return;
      const admin = (roles ?? []).some((r) => r.role === "admin");
      setIsAdmin(admin);
      setReady(true);
      if (admin) await load();
    };
    check();
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate("/auth", { replace: true });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [navigate, load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-content-fetch", { body: {} });
      if (error) throw error;
      toast.success(`Conteúdo gerado: ${(data as { topic?: string })?.topic ?? "tema do dia"}`);
      await load();
    } catch (err) {
      toast.error(`Falha ao gerar: ${(err as Error).message}`);
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const review = async (id: string, status: "approved" | "rejected") => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("instagram_creatives")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setCreatives((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    toast.success(status === "approved" ? "Criativo aprovado" : "Criativo rejeitado");
  };

  const toggleSource = async (source: Source) => {
    const { error } = await supabase
      .from("instagram_trend_sources")
      .update({ active: !source.active })
      .eq("id", source.id);
    if (error) return toast.error(error.message);
    setSources((prev) => prev.map((s) => (s.id === source.id ? { ...s, active: !s.active } : s)));
  };

  const addSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSource.name || !newSource.url) return;
    const { data, error } = await supabase.from("instagram_trend_sources").insert(newSource).select().single();
    if (error) return toast.error(error.message);
    setSources((prev) => [...prev, data as Source]);
    setNewSource({ name: "", url: "" });
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Acesso restrito</h1>
        <p className="text-muted-foreground max-w-sm">
          Sua conta não tem permissão de administrador para revisar criativos.
        </p>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>Sair</Button>
      </div>
    );
  }

  const latestRun = runs[0];
  const pending = creatives.filter((c) => c.status === "pending_review");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">Fila de revisão</h1>
            <p className="text-xs text-muted-foreground">Nada é publicado sem sua aprovação</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/biblioteca">
                <Images className="w-4 h-4 mr-2" /> Biblioteca
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin/casas">Casas (Sistema Fiep)</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/agente">Agente</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/custos">Custos</Link>
            </Button>
            <Button onClick={generate} disabled={generating} className="bg-gradient-primary">
              {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Gerar do dia
            </Button>
            <Button variant="ghost" size="icon" onClick={() => supabase.auth.signOut()}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {latestRun && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg">{latestRun.topic_title ?? "Rodada em andamento"}</CardTitle>
                <Badge variant="outline">{latestRun.status}</Badge>
              </div>
              <CardDescription>{latestRun.topic_summary ?? latestRun.error_message}</CardDescription>
            </CardHeader>
          </Card>
        )}

        <section>
          <h2 className="text-lg font-bold mb-4">
            Aguardando revisão {pending.length > 0 && <span className="text-primary">({pending.length})</span>}
          </h2>
          {creatives.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum criativo ainda. Toque em “Gerar do dia” para pesquisar o tema mais comentado e criar as peças.
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {creatives.map((c) => (
                <CreativeReviewCard key={c.id} creative={c} onReview={review} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-bold mb-4">Fontes de pesquisa</h2>
          <div className="space-y-2">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <Switch checked={s.active} onCheckedChange={() => toggleSource(s)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.last_fetch_status ?? s.url}</p>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={addSource} className="flex flex-col sm:flex-row gap-2 mt-4">
            <Input
              placeholder="Nome da fonte"
              value={newSource.name}
              onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
            />
            <Input
              placeholder="Endereço do feed RSS"
              value={newSource.url}
              onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
            />
            <Button type="submit" variant="outline">
              <Plus className="w-4 h-4 mr-1" /> Adicionar
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
};

export default Admin;
