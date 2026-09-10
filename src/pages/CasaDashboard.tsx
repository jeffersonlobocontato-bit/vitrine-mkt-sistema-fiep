import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import {
  Loader2,
  ArrowLeft,
  Sparkles,
  Megaphone,
  LayoutTemplate,
  Share2,
  BookOpen,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

interface Tile {
  to: string;
  label: string;
  description: string;
  icon: typeof Sparkles;
  visible: boolean;
}

const CasaDashboard = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { loading, user, isPlatformAdmin, hasCasaAccess, hasCasaRole, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && casa && !hasCasaAccess(casa.id)) navigate("/", { replace: true });
  }, [loading, casa, hasCasaAccess, navigate]);

  if (loading || !user || !casa) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EDEEF1]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1B2559" }} />
      </div>
    );
  }

  const primary = casa.cores.primary ?? "#1B2559";
  const accent = casa.cores.accent ?? "#2A6DF0";
  const isDesigner = isPlatformAdmin || hasCasaRole(casa.id, "designer");
  const isGestor = isPlatformAdmin || hasCasaRole(casa.id, "gestor");

  const tiles: Tile[] = [
    {
      to: `/gerar?casa=${casa.slug}`,
      label: "Gerar criativo",
      description: "Card, carrossel ou story a partir de um preset pronto",
      icon: Sparkles,
      visible: true,
    },
    {
      to: `/casa/${casa.slug}/aprovados`,
      label: "Aprovados",
      description: "Criativos já aprovados, organizados por campanha",
      icon: CheckCircle2,
      visible: true,
    },
    {
      to: `/admin/${casa.slug}/campanhas`,
      label: "Campanhas e unidades",
      description: "Estrutura de campanhas, itens e cadastro de unidades",
      icon: Megaphone,
      visible: isDesigner || isGestor,
    },
    {
      to: `/admin/${casa.slug}/presets`,
      label: "Presets",
      description: "Arte de referência e editor visual de campos",
      icon: LayoutTemplate,
      visible: isDesigner,
    },
    {
      to: `/admin/${casa.slug}/biblioteca`,
      label: "Biblioteca RAG",
      description: "Manuais, padrões de copy e referências da marca",
      icon: BookOpen,
      visible: isDesigner,
    },
    {
      to: `/admin/${casa.slug}/publicacao`,
      label: "Publicação",
      description: "Configuração das redes sociais (desligado até ativar)",
      icon: Share2,
      visible: isGestor,
    },
  ].filter((t) => t.visible);

  return (
    <div className="min-h-screen bg-[#EDEEF1]">
      <header className="text-white" style={{ backgroundColor: primary }}>
        <div className="container mx-auto px-6 py-5 flex items-center gap-4">
          <Link to="/" className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] uppercase" style={{ color: accent }}>
              Sistema Fiep
            </p>
            <h1 className="text-xl font-bold">{casa.nome}</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.to}
                to={tile.to}
                className="group flex flex-col gap-3 rounded-2xl bg-white border border-black/5 p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}1A`, color: accent }}>
                  <Icon className="w-6 h-6" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="font-bold" style={{ color: primary }}>{tile.label}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{tile.description}</p>
                </div>
                <div className="mt-auto flex items-center text-sm font-medium gap-1" style={{ color: accent }}>
                  Abrir <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default CasaDashboard;
