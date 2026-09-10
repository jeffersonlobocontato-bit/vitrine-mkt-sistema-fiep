import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso, type Casa } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

// casas ainda não está no types.ts gerado (depende de acesso ao projeto Supabase
// certo para regenerar) — mesmo padrão de cast usado no restante do admin antes
// dos tipos serem regenerados.
const db = supabase as any;

const COLOR_KEYS: { key: "primary" | "accent" | "surface" | "background" | "muted"; label: string }[] = [
  { key: "primary", label: "Primária (base institucional)" },
  { key: "accent", label: "Destaque da Casa" },
  { key: "surface", label: "Fundo de seção" },
  { key: "background", label: "Fundo geral" },
  { key: "muted", label: "Texto secundário" },
];

const AdminCasas = () => {
  const navigate = useNavigate();
  const { loading, isPlatformAdmin, casas, reload } = useCasaAcesso();
  const [saving, setSaving] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (!loading && !isPlatformAdmin) navigate("/admin", { replace: true });
  }, [loading, isPlatformAdmin, navigate]);

  const setColor = (casaId: string, key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [casaId]: { ...prev[casaId], [key]: value } }));
  };

  const save = async (casa: Casa) => {
    setSaving(casa.id);
    const cores = { ...casa.cores, ...(edits[casa.id] ?? {}) };
    const { error } = await db.from("casas").update({ cores }).eq("id", casa.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success(`Cores de ${casa.nome} atualizadas`);
    await reload();
  };

  if (loading) return <Loader2 className="w-6 h-6 animate-spin m-8" />;
  if (!isPlatformAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-xl font-bold">Casas</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <p className="text-sm text-muted-foreground">
          Paleta institucional (base compartilhada) + cor de destaque de cada Casa, extraída dos sites oficiais.
          Ajuste aqui se a marca mudar.
        </p>
        <div className="grid md:grid-cols-2 gap-4">
          {casas.map((casa) => (
            <Card key={casa.id}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div
                    className="w-6 h-6 rounded-full border border-border"
                    style={{ backgroundColor: casa.cores.accent ?? "#999" }}
                  />
                  <CardTitle>{casa.nome}</CardTitle>
                </div>
                <CardDescription>slug: {casa.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {COLOR_KEYS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Label className="w-48 text-xs shrink-0">{label}</Label>
                    <Input
                      type="text"
                      value={edits[casa.id]?.[key] ?? casa.cores[key] ?? ""}
                      onChange={(e) => setColor(casa.id, key, e.target.value)}
                      className="font-mono text-xs"
                    />
                    <div
                      className="w-8 h-8 rounded border border-border shrink-0"
                      style={{ backgroundColor: edits[casa.id]?.[key] ?? casa.cores[key] ?? "transparent" }}
                    />
                  </div>
                ))}
                <Button size="sm" onClick={() => save(casa)} disabled={saving === casa.id}>
                  {saving === casa.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Salvar
                </Button>
                <Button size="sm" variant="outline" asChild className="ml-2">
                  <Link to={`/admin/${casa.slug}/campanhas`}>Ver campanhas</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default AdminCasas;
