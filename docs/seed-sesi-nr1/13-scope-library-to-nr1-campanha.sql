-- Os 9 documentos da biblioteca foram colados pela tela geral da Casa
-- (Admin → /casa/sesi → Biblioteca RAG, sem campanha selecionada), então
-- ficaram com campanha_id NULL — o que os torna visíveis para QUALQUER
-- preset/campanha da Sesi, não só o NR-1. Biblioteca não deve ter escopo
-- geral de Casa: sempre por campanha (ou por unidade, quando aplicável).
-- Reamarra os 9 documentos à campanha "Segurança e Saúde" (NR-1). Idempotente.
UPDATE public.knowledge_documents kd
SET campanha_id = c.id
FROM public.campanhas c
JOIN public.casas ca ON ca.id = c.casa_id
WHERE ca.slug = 'sesi'
  AND c.slug = 'seguranca-saude'
  AND kd.casa_id = ca.id
  AND kd.campanha_id IS NULL;
