import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Trophy } from "lucide-react";

// casa_members/user_units/profiles/creative_downloads/instagram_runs.created_by
// ainda não estão totalmente no types.ts gerado.
const db = supabase as any;

interface RankRow {
  userId: string;
  label: string;
  detail: string;
  score: number;
}

/** Vermelho (baixo engajamento) -> verde (alto), relativo ao maior score do grupo. */
const engagementColor = (ratio: number) => `hsl(${Math.round(Math.max(0, Math.min(1, ratio)) * 120)} 70% 42%)`;

const RankingBar = ({ rows }: { rows: RankRow[] }) => {
  const max = Math.max(1, ...rows.map((r) => r.score));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Ninguém com esse papel ainda.</p>;
  return (
    <div className="space-y-3">
      {[...rows]
        .sort((a, b) => b.score - a.score)
        .map((r, i) => {
          const ratio = r.score / max;
          const color = engagementColor(ratio);
          return (
            <div key={r.userId} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {i === 0 && r.score > 0 && "🏆 "}
                    {r.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{r.detail}</p>
                </div>
                <span className="text-sm font-bold shrink-0" style={{ color }}>{r.score}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, ratio * 100)}%`, backgroundColor: color }} />
              </div>
            </div>
          );
        })}
    </div>
  );
};

const countBy = (rows: { [k: string]: unknown }[], key: string): Map<string, number> => {
  const map = new Map<string, number>();
  for (const row of rows) {
    const id = row[key] as string | null;
    if (!id) continue;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
};

const Ranking = () => {
  const navigate = useNavigate();
  const { loading, user, isPlatformAdmin, casaMemberships, casas } = useCasaAcesso();
  const [fetching, setFetching] = useState(true);
  const [designers, setDesigners] = useState<RankRow[]>([]);
  const [socialMedia, setSocialMedia] = useState<RankRow[]>([]);
  const [vendas, setVendas] = useState<RankRow[]>([]);

  const gestorCasaIds = casaMemberships.filter((m) => m.role === "gestor").map((m) => m.casa_id);
  const canView = isPlatformAdmin || gestorCasaIds.length > 0;
  // chaves estáveis para não recriar o load em cada render
  const casaIdsKey = (isPlatformAdmin ? casas.map((c) => c.id) : gestorCasaIds).sort().join(",");

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);
  useEffect(() => {
    if (!loading && user && !canView) navigate("/", { replace: true });
  }, [loading, user, canView, navigate]);

  const load = useCallback(async () => {
    const casaIds = isPlatformAdmin ? casas.map((c) => c.id) : gestorCasaIds;
    if (casaIds.length === 0) return setFetching(false);
    setFetching(true);

    const [{ data: profiles }, { data: members }, { data: unidades }, { data: presets }, { data: docs }, { data: runs }, { data: downloads }] =
      await Promise.all([
        db.from("profiles").select("id, email"),
        db.from("casa_members").select("user_id, role").in("casa_id", casaIds),
        db.from("unidades").select("id").in("casa_id", casaIds),
        db.from("agent_presets").select("created_by").in("casa_id", casaIds),
        db.from("knowledge_documents").select("created_by").in("casa_id", casaIds),
        db.from("instagram_runs").select("created_by, instagram_creatives(reviewed_by)").in("casa_id", casaIds),
        db.from("creative_downloads").select("user_id").in("casa_id", casaIds),
      ]);

    const unidadeIds = ((unidades ?? []) as { id: string }[]).map((u) => u.id);
    const { data: units } = unidadeIds.length
      ? await db.from("user_units").select("user_id").in("unidade_id", unidadeIds)
      : { data: [] };

    const emailOf = (id: string) => (profiles ?? []).find((p: { id: string; email: string }) => p.id === id)?.email ?? id.slice(0, 8);

    const presetCounts = countBy((presets ?? []) as any[], "created_by");
    const docCounts = countBy((docs ?? []) as any[], "created_by");
    const generatedCounts = countBy((runs ?? []) as any[], "created_by");
    const reviewedRows = ((runs ?? []) as { instagram_creatives?: { reviewed_by: string | null }[] }[]).flatMap(
      (r) => r.instagram_creatives ?? [],
    );
    const approvedCounts = countBy(reviewedRows as any[], "reviewed_by");
    const downloadCounts = countBy((downloads ?? []) as any[], "user_id");

    const casaMembers = (members ?? []) as { user_id: string; role: string }[];
    const designerIds = [...new Set(casaMembers.filter((m) => m.role === "designer").map((m) => m.user_id))];
    const socialIds = [...new Set(casaMembers.filter((m) => m.role === "social_media").map((m) => m.user_id))];
    const vendaIds = [...new Set(((units ?? []) as { user_id: string }[]).map((u) => u.user_id))];

    setDesigners(
      designerIds.map((id) => {
        const p = presetCounts.get(id) ?? 0;
        const d = docCounts.get(id) ?? 0;
        return { userId: id, label: emailOf(id), detail: `${p} preset(s) · ${d} material(is) na biblioteca`, score: p + d };
      }),
    );
    setSocialMedia(
      socialIds.map((id) => {
        const g = generatedCounts.get(id) ?? 0;
        const a = approvedCounts.get(id) ?? 0;
        return { userId: id, label: emailOf(id), detail: `${g} gerado(s) · ${a} aprovado(s)`, score: g + a };
      }),
    );
    setVendas(
      vendaIds.map((id) => {
        const g = generatedCounts.get(id) ?? 0;
        const b = downloadCounts.get(id) ?? 0;
        return { userId: id, label: emailOf(id), detail: `${g} gerado(s) · ${b} baixado(s)`, score: g + b };
      }),
    );
    setFetching(false);
  }, [isPlatformAdmin, casas, gestorCasaIds]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !canView) return <Loader2 className="w-6 h-6 animate-spin m-8" />;

  return (
    <div className="min-h-screen bg-[#EDEEF1]">
      <header className="text-white" style={{ backgroundColor: "#1B2559" }}>
        <div className="container mx-auto px-6 py-5 flex items-center gap-4">
          <Link to="/" className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] uppercase" style={{ color: "#2A6DF0" }}>Sistema Fiep</p>
            <h1 className="text-xl font-bold flex items-center gap-2"><Trophy className="w-5 h-5" /> Ranking de engajamento</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-3xl">
        {fetching ? (
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1B2559" }} />
        ) : (
          <Tabs defaultValue="designers">
            <TabsList>
              <TabsTrigger value="designers">Designers</TabsTrigger>
              <TabsTrigger value="social">Social media</TabsTrigger>
              <TabsTrigger value="vendas">Relacionamento/Vendas</TabsTrigger>
            </TabsList>
            <TabsContent value="designers" className="pt-4"><RankingBar rows={designers} /></TabsContent>
            <TabsContent value="social" className="pt-4"><RankingBar rows={socialMedia} /></TabsContent>
            <TabsContent value="vendas" className="pt-4"><RankingBar rows={vendas} /></TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Ranking;
