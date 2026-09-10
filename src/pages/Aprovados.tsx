import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Loader2, ArrowLeft, Download, CheckCircle2 } from "lucide-react";

// campanhas/instagram_runs(casa_id/campanha_id)/instagram_creatives(campanha_item_id) ainda não
// estão totalmente no types.ts gerado.
const db = supabase as any;

interface Campanha { id: string; nome: string }
interface Item { id: string; nome: string; campanha_id: string }
interface Creative {
  id: string;
  format: "card" | "carousel" | "story";
  caption: string;
  final_image_urls: string[];
  campanha_item_id: string | null;
  created_at: string;
  campanha_id: string | null;
}

const FORMAT_LABEL: Record<string, string> = { card: "Card", carousel: "Carrossel", story: "Story" };

const Aprovados = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { loading, user, hasCasaAccess, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!loading && casa && !hasCasaAccess(casa.id)) navigate("/", { replace: true });
  }, [loading, casa, hasCasaAccess, navigate]);

  const load = useCallback(async () => {
    if (!casa) return;
    setFetching(true);
    const { data: c } = await db.from("campanhas").select("id, nome").eq("casa_id", casa.id).order("nome");
    setCampanhas((c ?? []) as Campanha[]);

    const campanhaIds = (c ?? []).map((x: Campanha) => x.id);
    if (campanhaIds.length > 0) {
      const { data: i } = await db.from("campanha_itens").select("id, nome, campanha_id").in("campanha_id", campanhaIds);
      setItens((i ?? []) as Item[]);
    } else {
      setItens([]);
    }

    const { data: runs } = await db
      .from("instagram_runs")
      .select("id, campanha_id, instagram_creatives(id, format, caption, final_image_urls, campanha_item_id, created_at, status)")
      .eq("casa_id", casa.id)
      .order("created_at", { ascending: false });

    const approved: Creative[] = (runs ?? []).flatMap((r: any) =>
      (r.instagram_creatives ?? [])
        .filter((cr: any) => cr.status === "approved")
        .map((cr: any) => ({ ...cr, campanha_id: r.campanha_id })),
    );
    setCreatives(approved);

    const entries = await Promise.all(
      approved
        .filter((cr) => cr.final_image_urls?.[0])
        .map(async (cr) => {
          const { data } = await supabase.storage.from("instagram-creatives").createSignedUrl(cr.final_image_urls[0], 3600);
          return [cr.id, data?.signedUrl ?? ""] as const;
        }),
    );
    setThumbs(Object.fromEntries(entries));
    setFetching(false);
  }, [casa]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (path: string, creativeId?: string) => {
    const { data } = await supabase.storage.from("instagram-creatives").createSignedUrl(path, 60);
    if (data) window.open(data.signedUrl, "_blank");
    if (creativeId && user && casa) await db.from("creative_downloads").insert({ creative_id: creativeId, user_id: user.id, casa_id: casa.id });
  };

  if (loading || !casa) return <Loader2 className="w-6 h-6 animate-spin m-8" />;

  const primary = casa.cores.primary ?? "#1B2559";
  const accent = casa.cores.accent ?? "#2A6DF0";

  const groups = campanhas
    .map((camp) => ({ campanha: camp, creatives: creatives.filter((cr) => cr.campanha_id === camp.id) }))
    .filter((g) => g.creatives.length > 0);
  const semCampanha = creatives.filter((cr) => !cr.campanha_id);

  return (
    <div className="min-h-screen bg-[#EDEEF1]">
      <header className="text-white" style={{ backgroundColor: primary }}>
        <div className="container mx-auto px-6 py-5 flex items-center gap-4">
          <Link to={`/casa/${casa.slug}`} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-xs font-semibold tracking-[0.08em] uppercase" style={{ color: accent }}>{casa.nome}</p>
            <h1 className="text-xl font-bold">Criativos aprovados</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10 space-y-10">
        {fetching && <Loader2 className="w-6 h-6 animate-spin" style={{ color: primary }} />}

        {!fetching && creatives.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum criativo aprovado ainda nesta Casa.</p>
        )}

        {groups.map(({ campanha, creatives: list }) => (
          <section key={campanha.id} className="space-y-4">
            <h2 className="text-lg font-bold" style={{ color: primary }}>{campanha.nome}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {list.map((cr) => {
                const item = itens.find((i) => i.id === cr.campanha_item_id);
                return (
                  <div key={cr.id} className="rounded-xl bg-white border border-black/5 shadow-sm overflow-hidden flex flex-col">
                    <div className="aspect-[4/5] bg-muted">
                      {thumbs[cr.id] && <img src={thumbs[cr.id]} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="p-3 space-y-1 flex-1 flex flex-col">
                      <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: accent }}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> {FORMAT_LABEL[cr.format]}
                      </div>
                      {item && <p className="text-xs font-medium truncate">{item.nome}</p>}
                      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{cr.caption}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {cr.final_image_urls.map((path, i) => (
                          <button
                            key={path}
                            onClick={() => download(path, cr.id)}
                            className="text-xs px-2 py-1 rounded-md border border-input flex items-center gap-1 hover:bg-muted"
                          >
                            <Download className="w-3 h-3" /> {cr.final_image_urls.length > 1 ? `#${i + 1}` : "Baixar"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {semCampanha.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-muted-foreground">Sem campanha</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {semCampanha.map((cr) => (
                <div key={cr.id} className="rounded-xl bg-white border border-black/5 shadow-sm overflow-hidden flex flex-col">
                  <div className="aspect-[4/5] bg-muted">
                    {thumbs[cr.id] && <img src={thumbs[cr.id]} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-3 space-y-1 flex-1 flex flex-col">
                    <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: accent }}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> {FORMAT_LABEL[cr.format]}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{cr.caption}</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {cr.final_image_urls.map((path, i) => (
                        <button
                          key={path}
                          onClick={() => download(path, cr.id)}
                          className="text-xs px-2 py-1 rounded-md border border-input flex items-center gap-1 hover:bg-muted"
                        >
                          <Download className="w-3 h-3" /> {cr.final_image_urls.length > 1 ? `#${i + 1}` : "Baixar"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default Aprovados;
