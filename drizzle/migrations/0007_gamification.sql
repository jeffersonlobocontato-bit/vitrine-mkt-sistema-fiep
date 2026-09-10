-- ============================================================
-- Gamificação: ranking de engajamento por papel (designers, social media,
-- relacionamento/vendas). Precisa de 3 peças que ainda não existiam:
--   1. profiles: nome/e-mail legível pra exibir no ranking (auth.users não é
--      consultável direto pelo client) — populado por trigger em auth.users.
--   2. instagram_runs.created_by: quem disparou a geração (não era gravado).
--   3. creative_downloads: log de quem baixou qual criativo (não existia).
-- Idempotente — seguro rodar de novo.
-- ============================================================

-- === Perfis (id/e-mail espelhados de auth.users, legível pelo client) ===
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email) VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill: usuários que já existiam antes deste trigger
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- === Quem gerou cada rodada (faltava — generate-creative não gravava) ===
ALTER TABLE public.instagram_runs
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- === Log de download (um evento por clique em "baixar") ===
CREATE TABLE IF NOT EXISTS public.creative_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creative_id uuid NOT NULL REFERENCES public.instagram_creatives(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  casa_id uuid REFERENCES public.casas(id) ON DELETE CASCADE,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creative_downloads_user ON public.creative_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_creative_downloads_casa ON public.creative_downloads(casa_id);

GRANT SELECT, INSERT ON public.creative_downloads TO authenticated;
GRANT ALL ON public.creative_downloads TO service_role;
ALTER TABLE public.creative_downloads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users log their own downloads" ON public.creative_downloads FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa staff view own casa downloads" ON public.creative_downloads FOR SELECT TO authenticated
    USING (casa_id IS NOT NULL AND public.is_casa_member(auth.uid(), casa_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins view all downloads" ON public.creative_downloads FOR SELECT TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
