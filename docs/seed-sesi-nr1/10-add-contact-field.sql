-- Complemento ao seed.sql: adiciona um 4º campo "contato" (CTA) ao preset de
-- teste, marcado como dataBound (preenchido com dado real, nunca escrito pela
-- IA) + um contato geral fictício no item (a campanha é escopo='geral', sem
-- unidade, então não há unidades.contatos pra puxar). Troque o telefone/
-- WhatsApp abaixo pelo número real quando tiver. Idempotente — seguro rodar
-- de novo.

-- 1. Contato geral (fictício) no item de campanha
UPDATE public.campanha_itens ci
SET dados = ci.dados || jsonb_build_object(
  'contato_geral', jsonb_build_object('telefone', '0800 000 0000', 'whatsapp', '(41) 99999-0000')
)
FROM public.campanhas c
JOIN public.casas ca ON ca.id = c.casa_id
WHERE ci.campanha_id = c.id
  AND ca.slug = 'sesi' AND c.slug = 'seguranca-saude'
  AND ci.nome = 'NR-1 — Gerenciamento de Riscos Ocupacionais'
  AND NOT (ci.dados ? 'contato_geral');

-- 2. Campo "contato" (dataBound) no template_spec do formato Card
DO $$
DECLARE
  target_preset_id uuid;
  already_has boolean;
BEGIN
  SELECT p.id INTO target_preset_id
  FROM public.agent_presets p
  JOIN public.casas ca ON ca.id = p.casa_id
  WHERE ca.slug = 'sesi' AND p.name = 'Especialistas do Sesi — NR-1 (teste)';

  IF target_preset_id IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.agent_presets p, jsonb_array_elements(p.template_spec -> 'card' -> 'fields') f
    WHERE p.id = target_preset_id AND f ->> 'key' = 'contato'
  ) INTO already_has;

  IF NOT already_has THEN
    UPDATE public.agent_presets
    SET template_spec = jsonb_set(
      template_spec,
      '{card,fields}',
      (template_spec -> 'card' -> 'fields') || jsonb_build_array(
        jsonb_build_object(
          'key', 'contato', 'label', 'Contato (CTA)',
          'x', 8, 'y', 90, 'w', 84, 'h', 7,
          'size', 30, 'color', '#FFFFFF', 'align', 'left', 'maxLines', 1,
          'dataBound', true
        )
      )
    )
    WHERE id = target_preset_id;
  END IF;
END $$;
