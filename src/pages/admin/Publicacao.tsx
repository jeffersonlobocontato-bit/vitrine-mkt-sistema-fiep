import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCasaAcesso } from "@/hooks/useCasaAcesso";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

// publish_channels ainda não está no types.ts gerado.
const db = supabase as any;

type Provider = "instagram" | "facebook" | "linkedin";
const PROVIDERS: { id: Provider; label: string; fields: { key: string; label: string }[] }[] = [
  { id: "instagram", label: "Instagram", fields: [{ key: "app_id", label: "App ID (Meta)" }, { key: "page_id", label: "Page ID" }, { key: "ig_business_account_id", label: "Instagram Business Account ID" }] },
  { id: "facebook", label: "Facebook", fields: [{ key: "app_id", label: "App ID (Meta)" }, { key: "page_id", label: "Page ID" }] },
  { id: "linkedin", label: "LinkedIn", fields: [{ key: "person_urn", label: "Person/Organization URN" }] },
];

interface Channel {
  id: string;
  provider: Provider;
  config: Record<string, string>;
  enabled: boolean;
}

const AdminPublicacao = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { loading, hasCasaRole, isPlatformAdmin, casas } = useCasaAcesso();
  const casa = casas.find((c) => c.slug === slug);
  const canManage = casa ? isPlatformAdmin || hasCasaRole(casa.id, "gestor") : false;

  const [channels, setChannels] = useState<Record<Provider, Channel | null>>({ instagram: null, facebook: null, linkedin: null });
  const [edits, setEdits] = useState<Record<Provider, Record<string, string>>>({ instagram: {}, facebook: {}, linkedin: {} });
  const [saving, setSaving] = useState<Provider | null>(null);

  const load = useCallback(async () => {
    if (!casa) return;
    const { data } = await db.from("publish_channels").select("*").eq("casa_id", casa.id);
    const byProvider: Record<Provider, Channel | null> = { instagram: null, facebook: null, linkedin: null };
    for (const row of (data ?? []) as Channel[]) byProvider[row.provider] = row;
    setChannels(byProvider);
  }, [casa]);

  useEffect(() => {
    if (casa) load();
  }, [casa, load]);

  useEffect(() => {
    if (!loading && casa && !canManage) navigate("/admin", { replace: true });
  }, [loading, casa, canManage, navigate]);

  const setField = (provider: Provider, key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [provider]: { ...prev[provider], [key]: value } }));
  };

  const save = async (provider: Provider, enabledOverride?: boolean) => {
    if (!casa) return;
    setSaving(provider);
    const existing = channels[provider];
    const config = { ...(existing?.config ?? {}), ...edits[provider] };
    const enabled = enabledOverride ?? existing?.enabled ?? false;
    const { error } = await db
      .from("publish_channels")
      .upsert({ id: existing?.id, casa_id: casa.id, provider, config, enabled }, { onConflict: "casa_id,provider" });
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva");
    await load();
  };

  if (loading || !casa) return <Loader2 className="w-6 h-6 animate-spin m-8" />;
  if (!canManage) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to={`/casa/${casa.slug}`}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-xl font-bold">Publicação automática — {casa.nome}</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6 max-w-2xl">
        <p className="text-sm text-muted-foreground">
          Deixe a configuração pronta agora; a publicação de verdade só liga se/quando a empresa decidir. Enquanto
          "Ativo" estiver desligado, nada é publicado automaticamente — os criativos aprovados continuam só para
          download manual.
        </p>
        {PROVIDERS.map((p) => {
          const channel = channels[p.id];
          return (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.label}</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ativo</span>
                    <Switch checked={channel?.enabled ?? false} onCheckedChange={(v) => save(p.id, v)} />
                  </div>
                </div>
                <CardDescription>Credenciais sensíveis (secrets/tokens) não ficam aqui — só IDs de configuração.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.fields.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs">{f.label}</Label>
                    <Input value={edits[p.id]?.[f.key] ?? channel?.config?.[f.key] ?? ""} onChange={(e) => setField(p.id, f.key, e.target.value)} />
                  </div>
                ))}
                <Button size="sm" onClick={() => save(p.id)} disabled={saving === p.id}>
                  {saving === p.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Salvar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
};

export default AdminPublicacao;
