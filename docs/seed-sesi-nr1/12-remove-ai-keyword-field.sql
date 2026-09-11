-- O campo "palavra_chave" (NR-01 escrito pela IA) era pouco confiável (às vezes o
-- modelo não preenche) e nunca teve a tipografia exata do design (NR em
-- verde-limão preenchido, 01 em contorno branco). Agora que o pacote de
-- componentes traz o gráfico pronto (NR01_Transparente.png), o campo de texto
-- não é mais necessário — depois de rodar este SQL, suba o PNG como "Elemento
-- gráfico avulso" na aba Card do preset (mesmo arquivo do .zip que você mandou)
-- e posicione onde o campo "palavra_chave" estava. Idempotente.
UPDATE public.agent_presets p
SET template_spec = jsonb_set(
  template_spec,
  '{card,fields}',
  COALESCE(
    (
      SELECT jsonb_agg(f)
      FROM jsonb_array_elements(template_spec -> 'card' -> 'fields') f
      WHERE f ->> 'key' <> 'palavra_chave'
    ),
    '[]'::jsonb
  )
)
FROM public.casas ca
WHERE p.casa_id = ca.id
  AND ca.slug = 'sesi'
  AND p.name = 'Especialistas do Sesi — NR-1 (teste)'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p.template_spec -> 'card' -> 'fields') f WHERE f ->> 'key' = 'palavra_chave'
  );
