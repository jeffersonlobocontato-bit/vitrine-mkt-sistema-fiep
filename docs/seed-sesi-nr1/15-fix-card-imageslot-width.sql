-- Reconferindo a arte de referência: a foto começa perto do meio do card
-- (~53% da largura), não a 45% como estava — por isso a foto estava
-- avançando demais pra esquerda, cobrindo espaço que é do "NR-01" e
-- deixando pouca folga pro texto. x sobe pra 53, w cai pra 47 (x+w
-- continua 100 = sangra até a borda direita). y/h ficam como estão
-- (37/63 — já ajustado antes pra ir até o rodapé). Idempotente.
UPDATE public.agent_presets p
SET template_spec = jsonb_set(
  jsonb_set(template_spec, '{card,imageSlot,x}', '53'),
  '{card,imageSlot,w}', '47'
)
FROM public.casas ca
WHERE p.casa_id = ca.id
  AND ca.slug = 'sesi'
  AND p.name = 'Especialistas do Sesi — NR-1 (teste)'
  AND (template_spec -> 'card' -> 'imageSlot' ->> 'x') IS DISTINCT FROM '53';
