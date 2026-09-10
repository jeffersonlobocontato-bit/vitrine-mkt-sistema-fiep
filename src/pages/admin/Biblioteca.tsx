import { useEffect } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import KnowledgeLibrary from "@/components/KnowledgeLibrary";

const AdminBiblioteca = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const campanhaId = params.get("campanha");
  const unidadeId = params.get("unidade");
  const { loading, hasCasaRole, isPlatformAdmin, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);
  const canManage = casa ? isPlatformAdmin || hasCasaRole(casa.id, "designer") : false;

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
        <KnowledgeLibrary casaId={casa.id} campanhaId={campanhaId} unidadeId={unidadeId} />
      </main>
    </div>
  );
};

export default AdminBiblioteca;
