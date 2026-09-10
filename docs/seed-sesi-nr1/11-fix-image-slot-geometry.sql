-- Ajusta o slot de imagem do preset de teste Sesi NR-1: no seed.sql original,
-- o slot parava em y+h=83% (37+46), deixando uma faixa em branco até o rodapé
-- do card. O slot precisa preencher o card inteiro entre o bloco de texto e o
-- rodapé/lateral direita (x+w já era 100 = 45+55; só h precisava crescer até
-- y+h=100). Idempotente — seguro rodar de novo.
UPDATE public.agent_presets p
SET template_spec = jsonb_set(
  template_spec,
  '{card,imageSlot,h}',
  to_jsonb((100 - (template_spec -> 'card' -> 'imageSlot' ->> 'y')::numeric))
)
FROM public.casas ca
WHERE p.casa_id = ca.id
  AND ca.slug = 'sesi'
  AND p.name = 'Especialistas do Sesi — NR-1 (teste)'
  AND (template_spec -> 'card' -> 'imageSlot') IS NOT NULL;
