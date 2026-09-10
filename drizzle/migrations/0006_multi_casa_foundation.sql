-- Fundação multi-Casa (Fiep, Sesi, Senai, IEL): transforma a plataforma de
-- single-tenant (um agente, uma biblioteca, um admin) em multi-tenant, com
-- campanhas/unidades por Casa, biblioteca RAG escopada, motor de preset
-- fechado (template_spec) e papéis granulares (designer/social_media/gestor
-- por Casa, vendedor restrito à própria unidade).
--
-- Idempotente: seguro rodar de novo do zero (usa IF NOT EXISTS/CREATE OR
-- REPLACE em tudo, e DO $$...EXCEPTION WHEN duplicate_object$$ nas policies),
-- caso uma execução anterior tenha parado no meio.

-- ============================================================
-- Casas (tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.casas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  cores jsonb NOT NULL DEFAULT '{}'::jsonb,
  fontes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Tokens extraídos dos sites oficiais (base institucional azul-marinho comum +
-- cor de destaque por Casa). Ver plano de implementação para a fonte.
INSERT INTO public.casas (slug, nome, cores) VALUES
  ('fiep','Fiep',  '{"primary":"#1B2559","accent":"#2A6DF0","surface":"#EDEEF1","background":"#FFFFFF","muted":"#6B7280"}'::jsonb),
  ('sesi','Sesi',  '{"primary":"#1B2559","accent":"#7AC142","surface":"#EDEEF1","background":"#FFFFFF","muted":"#6B7280"}'::jsonb),
  ('senai','Senai','{"primary":"#1B2559","accent":"#F5821F","surface":"#EEEFF1","background":"#FFFFFF","muted":"#8892B0"}'::jsonb),
  ('iel','IEL',    '{"primary":"#1B2559","accent":"#7B2FF7","surface":"#EDEEF1","background":"#FFFFFF","muted":"#6B7280"}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

GRANT SELECT ON public.casas TO authenticated;
GRANT ALL ON public.casas TO service_role;
ALTER TABLE public.casas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated can view casas" ON public.casas FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage casas" ON public.casas FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Papéis por Casa (designer | social_media | gestor)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.casa_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_id uuid NOT NULL REFERENCES public.casas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('designer','social_media','gestor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casa_id, user_id)
);

CREATE OR REPLACE FUNCTION public.has_casa_role(_user_id uuid, _casa_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.casa_members WHERE user_id = _user_id AND casa_id = _casa_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_casa_member(_user_id uuid, _casa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.casa_members WHERE user_id = _user_id AND casa_id = _casa_id);
$$;

REVOKE EXECUTE ON FUNCTION public.has_casa_role(uuid, uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_casa_role(uuid, uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_casa_member(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_casa_member(uuid, uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.casa_members TO authenticated;
GRANT ALL ON public.casa_members TO service_role;
ALTER TABLE public.casa_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users view own casa membership" ON public.casa_members FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa gestores manage own casa members" ON public.casa_members FOR ALL TO authenticated
    USING (public.has_casa_role(auth.uid(), casa_id, 'gestor'))
    WITH CHECK (public.has_casa_role(auth.uid(), casa_id, 'gestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage casa members" ON public.casa_members FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Unidades (estrutura pronta; lista real de cidades/unidades vem por upload depois)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_id uuid NOT NULL REFERENCES public.casas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cidade text NOT NULL,
  estado text,
  endereco text,
  contatos jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unidades_casa ON public.unidades(casa_id);

CREATE TABLE IF NOT EXISTS public.user_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, unidade_id)
);

CREATE OR REPLACE FUNCTION public.user_belongs_to_unidade(_user_id uuid, _unidade_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_units WHERE user_id = _user_id AND unidade_id = _unidade_id);
$$;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_unidade(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_unidade(uuid, uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Casa staff manage unidades" ON public.unidades FOR ALL TO authenticated
    USING (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'))
    WITH CHECK (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa members view unidades" ON public.unidades FOR SELECT TO authenticated
    USING (public.is_casa_member(auth.uid(), casa_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Unit users view own unidade" ON public.unidades FOR SELECT TO authenticated
    USING (public.user_belongs_to_unidade(auth.uid(), id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage unidades" ON public.unidades FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_units TO authenticated;
GRANT ALL ON public.user_units TO service_role;
ALTER TABLE public.user_units ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users view own unit links" ON public.user_units FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa gestores manage unit links in their casa" ON public.user_units FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.unidades u WHERE u.id = user_units.unidade_id AND public.has_casa_role(auth.uid(), u.casa_id, 'gestor')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.unidades u WHERE u.id = user_units.unidade_id AND public.has_casa_role(auth.uid(), u.casa_id, 'gestor')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage user units" ON public.user_units FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Campanhas / áreas de serviço (cada uma com sua biblioteca RAG isolada)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_id uuid NOT NULL REFERENCES public.casas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  slug text NOT NULL,
  escopo text NOT NULL CHECK (escopo IN ('por_unidade','geral')) DEFAULT 'geral',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casa_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_campanhas_casa ON public.campanhas(casa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanhas TO authenticated;
GRANT ALL ON public.campanhas TO service_role;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Casa staff manage campanhas" ON public.campanhas FOR ALL TO authenticated
    USING (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'))
    WITH CHECK (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa members view campanhas" ON public.campanhas FOR SELECT TO authenticated
    USING (public.is_casa_member(auth.uid(), casa_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Unit users view campanhas of their casa" ON public.campanhas FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.unidades u JOIN public.user_units uu ON uu.unidade_id = u.id
      WHERE u.casa_id = campanhas.casa_id AND uu.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage campanhas" ON public.campanhas FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Itens variáveis dentro de uma campanha.
-- escopo='por_unidade': 1 item por unidade (preço/condições/contato daquela unidade).
-- escopo='geral': item = serviço do portfólio (ex.: exames do Sesi Saúde), unidade_id fica null.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campanha_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.unidades(id) ON DELETE CASCADE,
  nome text NOT NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campanha_itens_campanha ON public.campanha_itens(campanha_id);
CREATE INDEX IF NOT EXISTS idx_campanha_itens_unidade ON public.campanha_itens(unidade_id);
DROP TRIGGER IF EXISTS update_campanha_itens_updated_at ON public.campanha_itens;
CREATE TRIGGER update_campanha_itens_updated_at BEFORE UPDATE ON public.campanha_itens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campanha_itens TO authenticated;
GRANT ALL ON public.campanha_itens TO service_role;
ALTER TABLE public.campanha_itens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Casa staff manage campanha itens" ON public.campanha_itens FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.campanhas c WHERE c.id = campanha_itens.campanha_id
      AND (public.has_casa_role(auth.uid(), c.casa_id, 'designer') OR public.has_casa_role(auth.uid(), c.casa_id, 'gestor'))
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.campanhas c WHERE c.id = campanha_itens.campanha_id
      AND (public.has_casa_role(auth.uid(), c.casa_id, 'designer') OR public.has_casa_role(auth.uid(), c.casa_id, 'gestor'))
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa members view campanha itens" ON public.campanha_itens FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.campanhas c WHERE c.id = campanha_itens.campanha_id AND public.is_casa_member(auth.uid(), c.casa_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Unit users view campanha itens in their casa" ON public.campanha_itens FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.campanhas c
        JOIN public.unidades u ON u.casa_id = c.casa_id
        JOIN public.user_units uu ON uu.unidade_id = u.id
        WHERE c.id = campanha_itens.campanha_id AND uu.user_id = auth.uid()
      )
      AND (campanha_itens.unidade_id IS NULL OR public.user_belongs_to_unidade(auth.uid(), campanha_itens.unidade_id))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage campanha itens" ON public.campanha_itens FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Presets: generaliza agent_presets para o motor de template determinístico
-- ============================================================
ALTER TABLE public.agent_presets
  ADD COLUMN IF NOT EXISTS casa_id uuid REFERENCES public.casas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_locked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS template_spec jsonb NOT NULL DEFAULT '{}'::jsonb;
  -- template_spec por formato: { card: {w,h,fields:[{key,label,x,y,w,h,font,size,color,align,max_lines}], image_slot:{x,y,w,h}}, carousel:{...}, story:{...} }

CREATE INDEX IF NOT EXISTS idx_agent_presets_casa ON public.agent_presets(casa_id);

DO $$ BEGIN
  CREATE POLICY "Casa designers manage presets" ON public.agent_presets FOR ALL TO authenticated
    USING (casa_id IS NOT NULL AND public.has_casa_role(auth.uid(), casa_id, 'designer'))
    WITH CHECK (casa_id IS NOT NULL AND public.has_casa_role(auth.uid(), casa_id, 'designer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa members view presets" ON public.agent_presets FOR SELECT TO authenticated
    USING (casa_id IS NOT NULL AND public.is_casa_member(auth.uid(), casa_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Unit users view presets of their casa" ON public.agent_presets FOR SELECT TO authenticated
    USING (casa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.unidades u JOIN public.user_units uu ON uu.unidade_id = u.id
      WHERE u.casa_id = agent_presets.casa_id AND uu.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (a policy "Admins can manage agent presets" já existe desde 0003 e continua valendo)

CREATE TABLE IF NOT EXISTS public.preset_reference_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id uuid NOT NULL REFERENCES public.agent_presets(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('arte_pronta','componente','regra_texto')),
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_preset_reference_files_preset ON public.preset_reference_files(preset_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preset_reference_files TO authenticated;
GRANT ALL ON public.preset_reference_files TO service_role;
ALTER TABLE public.preset_reference_files ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Casa designers manage preset files" ON public.preset_reference_files FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.agent_presets p WHERE p.id = preset_reference_files.preset_id
      AND p.casa_id IS NOT NULL AND (public.has_casa_role(auth.uid(), p.casa_id, 'designer') OR public.has_casa_role(auth.uid(), p.casa_id, 'gestor'))
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.agent_presets p WHERE p.id = preset_reference_files.preset_id
      AND p.casa_id IS NOT NULL AND (public.has_casa_role(auth.uid(), p.casa_id, 'designer') OR public.has_casa_role(auth.uid(), p.casa_id, 'gestor'))
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage preset files" ON public.preset_reference_files FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Biblioteca RAG: escopo multi-Casa (hoje só tinha preset_id)
-- ============================================================
ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS casa_id uuid REFERENCES public.casas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.campanhas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id) ON DELETE CASCADE;
-- Novo doc_type 'copy_reference' ("referência de texto" do método DEL) — doc_type é TEXT
-- livre nesta tabela (sem enum/CHECK), então só precisa entrar na constante DOC_TYPES do
-- frontend (src/components/KnowledgeLibrary.tsx), nada a alterar aqui no schema.

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_casa ON public.knowledge_documents(casa_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_campanha ON public.knowledge_documents(campanha_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_unidade ON public.knowledge_documents(unidade_id);

DO $$ BEGIN
  CREATE POLICY "Casa designers manage knowledge documents" ON public.knowledge_documents FOR ALL TO authenticated
    USING (casa_id IS NOT NULL AND public.has_casa_role(auth.uid(), casa_id, 'designer'))
    WITH CHECK (casa_id IS NOT NULL AND public.has_casa_role(auth.uid(), casa_id, 'designer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (a policy "Admins can manage knowledge documents" já existe desde 0004 e continua valendo)

-- match_knowledge_chunks ganha filtros novos de casa/campanha/unidade, preservando a
-- assinatura antiga por posição (compatível com chamadas existentes que só passam os 4
-- primeiros argumentos).
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding vector(3072),
  match_count int DEFAULT 8,
  filter_doc_types text[] DEFAULT NULL,
  filter_preset uuid DEFAULT NULL,
  filter_casa uuid DEFAULT NULL,
  filter_campanha uuid DEFAULT NULL,
  filter_unidade uuid DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid, document_id uuid, title text, doc_type text, content text, similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, d.id, d.title, d.doc_type, c.content,
    1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM public.knowledge_chunks c
  JOIN public.knowledge_documents d ON d.id = c.document_id
  WHERE d.active AND d.status = 'ready' AND c.embedding IS NOT NULL
    AND (filter_doc_types IS NULL OR d.doc_type = ANY(filter_doc_types))
    AND (filter_preset IS NULL OR d.preset_id IS NULL OR d.preset_id = filter_preset)
    AND (filter_casa IS NULL OR d.casa_id IS NULL OR d.casa_id = filter_casa)
    AND (filter_campanha IS NULL OR d.campanha_id IS NULL OR d.campanha_id = filter_campanha)
    AND (filter_unidade IS NULL OR d.unidade_id IS NULL OR d.unidade_id = filter_unidade)
  ORDER BY c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;
REVOKE ALL ON FUNCTION public.match_knowledge_chunks(vector, int, text[], uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_knowledge_chunks(vector, int, text[], uuid, uuid, uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- Banco de imagens por campanha/serviço
-- ============================================================
CREATE TABLE IF NOT EXISTS public.imagens_banco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_id uuid NOT NULL REFERENCES public.casas(id) ON DELETE CASCADE,
  campanha_id uuid REFERENCES public.campanhas(id) ON DELETE CASCADE,
  campanha_item_id uuid REFERENCES public.campanha_itens(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imagens_banco_casa ON public.imagens_banco(casa_id);
CREATE INDEX IF NOT EXISTS idx_imagens_banco_campanha ON public.imagens_banco(campanha_id);
CREATE INDEX IF NOT EXISTS idx_imagens_banco_item ON public.imagens_banco(campanha_item_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.imagens_banco TO authenticated;
GRANT ALL ON public.imagens_banco TO service_role;
ALTER TABLE public.imagens_banco ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Casa staff manage imagens banco" ON public.imagens_banco FOR ALL TO authenticated
    USING (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'))
    WITH CHECK (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa members view imagens banco" ON public.imagens_banco FOR SELECT TO authenticated
    USING (public.is_casa_member(auth.uid(), casa_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Unit users view imagens banco of their casa" ON public.imagens_banco FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.unidades u JOIN public.user_units uu ON uu.unidade_id = u.id
      WHERE u.casa_id = imagens_banco.casa_id AND uu.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage imagens banco" ON public.imagens_banco FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Config futura de API de banco de imagens por assinatura (Fase 2 — só o shape agora,
-- sem integração real; a chave em si vai como secret do Supabase, nunca nesta tabela).
CREATE TABLE IF NOT EXISTS public.stock_image_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_id uuid NOT NULL REFERENCES public.casas(id) ON DELETE CASCADE,
  provider text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_image_configs TO authenticated;
GRANT ALL ON public.stock_image_configs TO service_role;
ALTER TABLE public.stock_image_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Casa staff manage stock image configs" ON public.stock_image_configs FOR ALL TO authenticated
    USING (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'))
    WITH CHECK (public.has_casa_role(auth.uid(), casa_id, 'designer') OR public.has_casa_role(auth.uid(), casa_id, 'gestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage stock image configs" ON public.stock_image_configs FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Painel de publicação por Casa/rede — pronto, desligado até decisão da empresa
-- ============================================================
CREATE TABLE IF NOT EXISTS public.publish_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  casa_id uuid NOT NULL REFERENCES public.casas(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('instagram','facebook','linkedin')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (casa_id, provider)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.publish_channels TO authenticated;
GRANT ALL ON public.publish_channels TO service_role;
ALTER TABLE public.publish_channels ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Casa gestores manage publish channels" ON public.publish_channels FOR ALL TO authenticated
    USING (public.has_casa_role(auth.uid(), casa_id, 'gestor'))
    WITH CHECK (public.has_casa_role(auth.uid(), casa_id, 'gestor'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage publish channels" ON public.publish_channels FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- instagram_runs / instagram_creatives: escopo de Casa para os criativos gerados
-- ============================================================
ALTER TABLE public.instagram_runs
  ADD COLUMN IF NOT EXISTS casa_id uuid REFERENCES public.casas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campanha_item_id uuid REFERENCES public.campanha_itens(id) ON DELETE SET NULL;

ALTER TABLE public.instagram_creatives
  ADD COLUMN IF NOT EXISTS campanha_item_id uuid REFERENCES public.campanha_itens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preset_id uuid REFERENCES public.agent_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_runs_casa ON public.instagram_runs(casa_id);

DO $$ BEGIN
  CREATE POLICY "Casa members view own casa runs" ON public.instagram_runs FOR SELECT TO authenticated
    USING (casa_id IS NOT NULL AND public.is_casa_member(auth.uid(), casa_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Unit users view own casa runs" ON public.instagram_runs FOR SELECT TO authenticated
    USING (casa_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.unidades u JOIN public.user_units uu ON uu.unidade_id = u.id
      WHERE u.casa_id = instagram_runs.casa_id AND uu.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (a policy "Admins can view instagram runs" já existe desde 0000 e continua valendo)

DO $$ BEGIN
  CREATE POLICY "Casa members manage own casa creatives" ON public.instagram_creatives FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.instagram_runs r WHERE r.id = instagram_creatives.run_id
      AND r.casa_id IS NOT NULL AND public.is_casa_member(auth.uid(), r.casa_id)
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.instagram_runs r WHERE r.id = instagram_creatives.run_id
      AND r.casa_id IS NOT NULL AND public.is_casa_member(auth.uid(), r.casa_id)
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Unit users manage own casa creatives" ON public.instagram_creatives FOR ALL TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.instagram_runs r
      JOIN public.unidades u ON u.casa_id = r.casa_id
      JOIN public.user_units uu ON uu.unidade_id = u.id
      WHERE r.id = instagram_creatives.run_id AND uu.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.instagram_runs r
      JOIN public.unidades u ON u.casa_id = r.casa_id
      JOIN public.user_units uu ON uu.unidade_id = u.id
      WHERE r.id = instagram_creatives.run_id AND uu.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- (a policy "Admins can manage instagram creatives" já existe desde 0000 e continua valendo)

-- ============================================================
-- Bucket de assets de preset (referências de design do time criativo)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('preset-assets', 'preset-assets', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  CREATE POLICY "Casa designers read preset assets" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'preset-assets' AND (public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.casa_members cm WHERE cm.user_id = auth.uid()
    )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa designers upload preset assets" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'preset-assets' AND (public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.casa_members cm WHERE cm.user_id = auth.uid() AND cm.role IN ('designer','gestor')
    )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa designers update preset assets" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'preset-assets' AND (public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.casa_members cm WHERE cm.user_id = auth.uid() AND cm.role IN ('designer','gestor')
    )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Casa designers delete preset assets" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'preset-assets' AND (public.has_role(auth.uid(), 'admin') OR EXISTS (
      SELECT 1 FROM public.casa_members cm WHERE cm.user_id = auth.uid() AND cm.role IN ('designer','gestor')
    )));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `imagens_banco` reaproveita o bucket já existente `instagram-creatives`
-- (path `banco/${casa_slug}/${campanha_slug}/...`) — sem policy nova de bucket
-- necessária, as policies admin-only já existentes nesse bucket seguem valendo
-- para o service_role (upload feito pela edge function); acesso de leitura do
-- time de Casa aos arquivos é resolvido via signed URL gerada com service_role,
-- mesmo padrão já usado em CreativeReviewCard.tsx.
