-- Container_Foto.png já foi enviado (junto com o pacote importado na aba Story —
-- preset_reference_files não é por formato, é do preset inteiro), só nunca tinha
-- virado a máscara de recorte de verdade no slot de imagem do Card. Acha o
-- arquivo pelo nome ("container" mas não "contorno" — esse é a moldura, outro
-- arquivo) e aplica como imageSlot.maskPath do Card. Idempotente.
WITH preset AS (
  SELECT p.id, p.template_spec
  FROM public.agent_presets p
  JOIN public.casas ca ON ca.id = p.casa_id
  WHERE ca.slug = 'sesi' AND p.name = 'Especialistas do Sesi — NR-1 (teste)'
),
mask_file AS (
  SELECT f.storage_path
  FROM public.preset_reference_files f, preset
  WHERE f.preset_id = preset.id
    AND f.storage_path ~* 'container'
    AND f.storage_path !~* 'contorno'
  ORDER BY f.created_at DESC
  LIMIT 1
)
UPDATE public.agent_presets p
SET template_spec = jsonb_set(p.template_spec, '{card,imageSlot,maskPath}', to_jsonb((SELECT storage_path FROM mask_file)))
FROM preset
WHERE p.id = preset.id AND EXISTS (SELECT 1 FROM mask_file);
