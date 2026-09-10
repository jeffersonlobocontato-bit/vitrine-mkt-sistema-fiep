-- Pacote de teste: Sesi · Segurança e Saúde · NR-1 (fictício, pra validar o fluxo
-- ponta a ponta). Idempotente — seguro rodar de novo.
--
-- O que este script preenche direto (não depende de IA/embeddings):
--   1. Campanha "Segurança e Saúde" (escopo geral) na Casa Sesi
--   2. Item de campanha "NR-1 — Gerenciamento de Riscos Ocupacionais"
--   3. Preset "Especialistas do Sesi — NR-1 (teste)" com o template_spec do
--      formato Card já mapeado a partir da análise da peça de referência
--      (posições/cores/tamanhos dos campos e do slot de imagem com máscara
--      de canto arredondado)
--
-- O que NÃO dá pra preencher por SQL (precisa passar pela interface, porque
-- depende de upload de arquivo e/ou geração de embeddings pela IA):
--   - A arte de referência em si (upload em Admin → Presets → aba Card →
--     "Enviar arte" — é a própria imagem que você me mandou)
--   - Os 9 documentos da biblioteca RAG (docs/seed-sesi-nr1/01..09*.md — cole
--     cada um em Admin → Biblioteca, escopado pra esta Casa/campanha, usando
--     "Ou cole o texto"; isso dispara o processamento/embedding automático)

-- 1. Campanha
INSERT INTO public.campanhas (casa_id, nome, slug, escopo)
SELECT id, 'Segurança e Saúde', 'seguranca-saude', 'geral'
FROM public.casas WHERE slug = 'sesi'
ON CONFLICT (casa_id, slug) DO NOTHING;

-- 2. Item de campanha
INSERT INTO public.campanha_itens (campanha_id, nome, dados)
SELECT c.id, 'NR-1 — Gerenciamento de Riscos Ocupacionais',
  '{"descricao":"A NR-1 exige que toda empresa gerencie riscos ocupacionais, incluindo riscos psicossociais desde a atualização de 2024 (GRO/PGR). O Sesi vai até a empresa para diagnosticar e apoiar a adequação."}'::jsonb
FROM public.campanhas c
JOIN public.casas ca ON ca.id = c.casa_id
WHERE ca.slug = 'sesi' AND c.slug = 'seguranca-saude'
AND NOT EXISTS (
  SELECT 1 FROM public.campanha_itens ci
  WHERE ci.campanha_id = c.id AND ci.nome = 'NR-1 — Gerenciamento de Riscos Ocupacionais'
);

-- 3. Preset com template_spec do formato Card já mapeado (canvas 1080x1350).
-- Geometria em % do canvas, extraída da análise da peça de referência:
--   - headline_destaque: "Especialistas do Sesi" — verde-limão de campanha, 2 linhas
--   - headline_apoio: "vão até você para esclarecer a" — branco, menor
--   - palavra_chave: "NR-01" — a maior fonte do card, dominante
--   - imageSlot: canto superior-esquerdo arredondado, resto reto, borda fina
--     na cor de campanha — igual à foto do palestrante na peça de referência
INSERT INTO public.agent_presets (casa_id, campanha_id, name, instructions, template_locked, template_spec)
SELECT
  ca.id,
  c.id,
  'Especialistas do Sesi — NR-1 (teste)',
  'Você escreve peças de Instagram para a campanha "Segurança e Saúde" do Sesi sobre a NR-1 (gerenciamento de riscos ocupacionais, incluindo riscos psicossociais). '
  || 'Público: donos e gestores de indústrias pequenas/médias, RH e SESMT. Tom direto, acolhedor, sem jargão jurídico, sem prometer resultado legal. '
  || 'Sempre cite "NR-1" pelo nome. Estrutura do card: um título de impacto (2 linhas), um subtítulo curto de conexão, e uma palavra-chave/número gigante em destaque (ex.: "NR-01") — é o elemento que mais chama atenção, deve ser curtíssimo (1-2 palavras ou um código). '
  || 'Nunca prometa isenção legal, nunca use dado estatístico que não foi fornecido, nunca trivialize saúde mental.',
  true,
  jsonb_build_object(
    'card', jsonb_build_object(
      'width', 1080, 'height', 1350,
      'fields', jsonb_build_array(
        jsonb_build_object('key','headline_destaque','label','Título (verde-limão)','x',8,'y',13,'w',62,'h',15,'size',92,'color','#D4E157','align','left','maxLines',2),
        jsonb_build_object('key','headline_apoio','label','Subtítulo (branco)','x',8,'y',29,'w',55,'h',10,'size',54,'color','#FFFFFF','align','left','maxLines',2),
        jsonb_build_object('key','palavra_chave','label','Palavra-chave em destaque','x',8,'y',40,'w',70,'h',17,'size',190,'color','#FFFFFF','align','left','maxLines',1)
      ),
      'imageSlot', jsonb_build_object(
        'x',45,'y',37,'w',55,'h',46,
        'radiusTopLeft',140,'radiusTopRight',0,'radiusBottomRight',0,'radiusBottomLeft',0,
        'borderColor','#D4E157','borderWidth',4
      )
    ),
    'story', jsonb_build_object('width',1080,'height',1920,'fields', jsonb_build_array()),
    'carousel', jsonb_build_object('width',1080,'height',1350,'fields', jsonb_build_array())
  )
FROM public.casas ca
JOIN public.campanhas c ON c.casa_id = ca.id AND c.slug = 'seguranca-saude'
WHERE ca.slug = 'sesi'
AND NOT EXISTS (
  SELECT 1 FROM public.agent_presets p WHERE p.casa_id = ca.id AND p.name = 'Especialistas do Sesi — NR-1 (teste)'
);
