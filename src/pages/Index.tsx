import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCasaAcesso, type Casa } from "@/hooks/useCasaAcesso";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, Building2, HeartPulse, GraduationCap, Briefcase, ChevronRight, Settings, Trophy, Users } from "lucide-react";

const CASA_ICON: Record<string, typeof Building2> = {
  fiep: Building2,
  sesi: HeartPulse,
  senai: GraduationCap,
  iel: Briefcase,
};

const CasaCard = ({ casa }: { casa: Casa }) => {
  const Icon = CASA_ICON[casa.slug] ?? Building2;
  const accent = casa.cores.accent ?? "#2A6DF0";
  const primary = casa.cores.primary ?? "#1B2559";
  return (
    <Link
      to={`/casa/${casa.slug}`}
      className="group relative flex flex-col gap-4 rounded-2xl bg-white border border-black/5 p-6 shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
    >
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${accent}1A`, color: accent }}
      >
        <Icon className="w-7 h-7" strokeWidth={1.75} />
      </div>
      <div>
        <h3 className="text-lg font-bold" style={{ color: primary }}>
          {casa.nome}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">Criativos, campanhas e biblioteca da Casa</p>
      </div>
      <div className="mt-auto flex items-center text-sm font-medium gap-1" style={{ color: accent }}>
        Acessar <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="absolute top-0 left-6 right-6 h-1 rounded-b-full" style={{ backgroundColor: accent }} />
    </Link>
  );
};

const Index = () => {
  const navigate = useNavigate();
  const { loading, user, isPlatformAdmin, casaMemberships, casasAcessiveis } = useCasaAcesso();
  const isGestorAnywhere = isPlatformAdmin || casaMemberships.some((m) => m.role === "gestor");

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EDEEF1]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#1B2559" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EDEEF1]">
      <header className="text-white" style={{ backgroundColor: "#1B2559" }}>
        <div className="container mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] uppercase" style={{ color: "#2A6DF0" }}>
              Sistema Fiep
            </p>
            <h1 className="text-xl font-bold">Vitrine de Marketing</h1>
          </div>
          <div className="flex items-center gap-2">
            {isPlatformAdmin && (
              <Link
                to="/admin/casas"
                className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors px-3 py-2"
              >
                <Settings className="w-4 h-4" /> Administração
              </Link>
            )}
            <button
              onClick={() => supabase.auth.signOut().then(() => navigate("/auth"))}
              className="flex items-center gap-1.5 text-sm text-white/80 hover:text-white transition-colors px-3 py-2"
            >
              <LogOut className="w-4 h-4" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-1" style={{ color: "#1B2559" }}>
            Escolha a Casa
          </h2>
          <div className="h-1 w-10 rounded-full mb-3" style={{ backgroundColor: "#2A6DF0" }} />
          <p className="text-muted-foreground max-w-xl">
            Cada Casa tem suas próprias campanhas, unidades, presets de arte e biblioteca de conhecimento.
          </p>
        </div>

        {casasAcessiveis.length === 0 ? (
          <div className="rounded-2xl bg-white border border-black/5 p-10 text-center text-muted-foreground">
            Você ainda não tem acesso a nenhuma Casa. Peça ao administrador para te vincular em Admin → Usuários.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {casasAcessiveis.map((casa) => (
              <CasaCard key={casa.id} casa={casa} />
            ))}
          </div>
        )}

        {isGestorAnywhere && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-8">
            <Link
              to="/admin/usuarios"
              className="group flex items-center gap-4 rounded-2xl p-6 text-white shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: "linear-gradient(90deg, #1B2559, #7AC142)" }}
            >
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-white/15">
                <Users className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">Usuários</h3>
                <p className="text-sm text-white/80 mt-1">Vincular acesso por Casa ou por unidade (vendas)</p>
              </div>
              <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <Link
              to="/ranking"
              className="group flex items-center gap-4 rounded-2xl p-6 text-white shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: "linear-gradient(90deg, #1B2559, #2A6DF0)" }}
            >
              <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-white/15">
                <Trophy className="w-7 h-7" strokeWidth={1.75} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">Ranking de engajamento</h3>
                <p className="text-sm text-white/80 mt-1">Gamificação por papel — designers, social media e relacionamento/vendas</p>
              </div>
              <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
