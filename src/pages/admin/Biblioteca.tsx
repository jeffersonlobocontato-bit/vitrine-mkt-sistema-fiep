import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ArrowLeft } from "lucide-react";
import KnowledgeLibrary from "@/components/KnowledgeLibrary";

// campanhas ainda não está totalmente no types.ts gerado.
const db = supabase as any;

interface Campanha { id: string; nome: string }

const AdminBiblioteca = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const campanhaId = params.get("campanha");
  const unidadeId = params.get("unidade");
  const { loading, hasCasaRole, isPlatformAdmin, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);
  const canManage = casa ? isPlatformAdmin || hasCasaRole(casa.id, "designer") : false;

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loadingCampanhas, setLoadingCampanhas] = useState(true);

  // Biblioteca nunca é de escopo geral da Casa — sempre por campanha (ou por unidade,
  // quando é o diferencial de uma unidade específica). Sem um dos dois na URL, pedimos
  // pra escolher a campanha antes de deixar colar/subir qualquer documento.
  const needsCampanhaPick = !campanhaId && !unidadeId;

  const loadCampanhas = useCallback(async () => {
    if (!casa || !needsCampanhaPick) return;
    setLoadingCampanhas(true);
    const { data } = await db.from("campanhas").select("id, nome").eq("casa_id", casa.id).eq("ativo", true).order("nome");
    setCampanhas((data ?? []) as Campanha[]);
    setLoadingCampanhas(false);
  }, [casa, needsCampanhaPick]);

  useEffect(() => {
    loadCampanhas();
  }, [loadCampanhas]);

  useEffect(() => {
    if (!loading && casa && !canManage) navigate("/admin", { replace: true });
  }, [loading, casa, canManage, navigate]);

  if (loading || !casa) return <Loader2 className="w-6 h-6 animate-spin m-8" />;
  if (!canManage) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/admin/${casa.slug}/campanhas`}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-xl font-bold">
            Biblioteca — {casa.nome}
            {unidadeId ? " · documento da unidade" : campanhaId ? " · campanha" : ""}
          </h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        {needsCampanhaPick ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Escolha a campanha</CardTitle>
              <CardDescription>
                A biblioteca nunca é geral da Casa — cada documento vale só pra uma campanha (padrões e regras
                daquele tema), então escolha a campanha antes de colar ou subir qualquer material.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingCampanhas ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : campanhas.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma campanha cadastrada ainda —{" "}
                  <Link to={`/admin/${casa.slug}/campanhas`} className="underline">crie uma primeiro</Link>.
                </p>
              ) : (
                campanhas.map((c) => (
                  <Button key={c.id} variant="outline" className="w-full justify-start" asChild>
                    <Link to={`/admin/${casa.slug}/biblioteca?campanha=${c.id}`}>{c.nome}</Link>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <KnowledgeLibrary casaId={casa.id} campanhaId={campanhaId} unidadeId={unidadeId} />
        )}
      </main>
    </div>
  );
};

export default AdminBiblioteca;
