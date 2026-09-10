import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

// casas/casa_members/user_units/unidades ainda não estão no types.ts gerado (depende de
// acesso ao projeto Supabase certo para regenerar) — mesmo padrão de cast usado no resto
// do admin até os tipos serem regenerados.
const db = supabase as any;

export type CasaRole = "designer" | "social_media" | "gestor";

export interface Casa {
  id: string;
  slug: string;
  nome: string;
  cores: { primary?: string; accent?: string; surface?: string; background?: string; muted?: string };
  fontes: Record<string, string>;
}

interface CasaMembership {
  casa_id: string;
  role: CasaRole;
}

interface UnitMembership {
  unidade_id: string;
  casa_id: string;
  unidade_nome: string;
}

export interface CasaAcesso {
  loading: boolean;
  user: User | null;
  isPlatformAdmin: boolean;
  casas: Casa[];
  casaMemberships: CasaMembership[];
  unitMemberships: UnitMembership[];
  /** Casas que o usuário pode acessar (admin vê todas; os demais só as suas). */
  casasAcessiveis: Casa[];
  hasCasaAccess: (casaId: string) => boolean;
  hasCasaRole: (casaId: string, role: CasaRole) => boolean;
  isUnitUser: boolean;
  reload: () => Promise<void>;
}

// mesmo padrão inline (sem AdminRoute) já usado em Admin.tsx/Agent.tsx/Costs.tsx,
// só que centralizado — resolve papel de platform admin / casa_member / user_unit
// de uma vez, para gatear as novas telas multi-Casa.
export function useCasaAcesso(): CasaAcesso {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [casas, setCasas] = useState<Casa[]>([]);
  const [casaMemberships, setCasaMemberships] = useState<CasaMembership[]>([]);
  const [unitMemberships, setUnitMemberships] = useState<UnitMembership[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    setUser(currentUser);

    if (!currentUser) {
      setIsPlatformAdmin(false);
      setCasas([]);
      setCasaMemberships([]);
      setUnitMemberships([]);
      setLoading(false);
      return;
    }

    const [{ data: roles }, { data: casasData }, { data: members }, { data: units }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", currentUser.id),
      db.from("casas").select("id, slug, nome, cores, fontes").order("nome"),
      db.from("casa_members").select("casa_id, role").eq("user_id", currentUser.id),
      db
        .from("user_units")
        .select("unidade_id, unidades(casa_id, nome)")
        .eq("user_id", currentUser.id),
    ]);

    setIsPlatformAdmin((roles ?? []).some((r) => r.role === "admin"));
    setCasas((casasData ?? []) as unknown as Casa[]);
    setCasaMemberships((members ?? []) as CasaMembership[]);
    setUnitMemberships(
      ((units ?? []) as { unidade_id: string; unidades: { casa_id: string; nome: string } | null }[]).map((u) => ({
        unidade_id: u.unidade_id,
        casa_id: u.unidades?.casa_id ?? "",
        unidade_nome: u.unidades?.nome ?? "",
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasCasaAccess = (casaId: string) =>
    isPlatformAdmin || casaMemberships.some((m) => m.casa_id === casaId) || unitMemberships.some((u) => u.casa_id === casaId);

  const hasCasaRole = (casaId: string, role: CasaRole) =>
    isPlatformAdmin || casaMemberships.some((m) => m.casa_id === casaId && m.role === role);

  const casasAcessiveis = isPlatformAdmin
    ? casas
    : casas.filter((c) => casaMemberships.some((m) => m.casa_id === c.id) || unitMemberships.some((u) => u.casa_id === c.id));

  return {
    loading,
    user,
    isPlatformAdmin,
    casas,
    casaMemberships,
    unitMemberships,
    casasAcessiveis,
    hasCasaAccess,
    hasCasaRole,
    isUnitUser: !isPlatformAdmin && casaMemberships.length === 0 && unitMemberships.length > 0,
    reload: load,
  };
}
