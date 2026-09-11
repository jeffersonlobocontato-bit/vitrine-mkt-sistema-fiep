-- O card de referência real é 1080x1440, não 1080x1350 (usado por engano no
-- primeiro cálculo, antes de eu conferir a proporção exata com você). Como as
-- posições dos campos são todas em % do canvas, só a "altura" declarada no
-- spec precisa mudar — nenhum campo precisa ser redesenhado. Idempotente.
UPDATE public.agent_presets p
SET template_spec = jsonb_set(
  jsonb_set(template_spec, '{card,height}', '1440'),
  '{carousel,height}', '1440'
)
FROM public.casas ca
WHERE p.casa_id = ca.id
  AND ca.slug = 'sesi'
  AND p.name = 'Especialistas do Sesi — NR-1 (teste)'
  AND (template_spec -> 'card' ->> 'height') IS DISTINCT FROM '1440';
