// Gera um criativo (card | carousel | story) para uma Casa + campanha + item
// (unidade ou serviço) selecionados, preenchendo EXATAMENTE o template_spec já
// desenhado pelo designer no editor de preset — a IA escreve só o texto de
// cada campo já definido (respeitando o limite de linhas), nunca decide
// layout. Adaptado de instagram-content-fetch/index.ts (mesma infra de custo,
// RAG e geração de imagem), trocando "tema do dia via RSS" por "campanha +
// item escolhidos pelo usuário" e trocando slides livres por preenchimento de
// template fechado.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { textCostUsd, imageCostUsd, toBrl } from '../_shared/pricing.ts'
import { embedTexts, toVectorLiteral, EMBEDDING_MODEL } from '../_shared/knowledge.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

type TemplateField = { key: string; label: string; maxLines?: number; dataBound?: boolean }
type FormatTemplateSpec = { width: number; height: number; fields: TemplateField[]; imageSlot?: { x: number; y: number; w: number; h: number } }

type Preset = {
  id: string
  name: string
  instructions: string
  provider: string
  text_model: string
  image_model: string
  carousel_slides: number
  image_budget: number
  casa_id: string
  template_locked: boolean
  template_spec: Partial<Record<'card' | 'carousel' | 'story', FormatTemplateSpec>>
}

type Ctx = {
  runId: string | null
  preset: Preset
  totals: { usd: number; brl: number; tokens: number; images: number }
}

function endpoint(preset: Preset, path: string) {
  const useOpenAI = preset.provider === 'openai' && OPENAI_API_KEY
  return useOpenAI ? `https://api.openai.com/v1${path}` : `https://ai.gateway.lovable.dev/v1${path}`
}
function apiKey(preset: Preset) {
  return preset.provider === 'openai' && OPENAI_API_KEY ? OPENAI_API_KEY : LOVABLE_API_KEY
}

async function logUsage(
  ctx: Ctx,
  entry: { step: string; model: string; input_tokens?: number; output_tokens?: number; images?: number; cost_usd: number; duration_ms: number; success?: boolean },
) {
  const cost_brl = toBrl(entry.cost_usd)
  ctx.totals.usd += entry.cost_usd
  ctx.totals.brl += cost_brl
  ctx.totals.tokens += (entry.input_tokens ?? 0) + (entry.output_tokens ?? 0)
  ctx.totals.images += entry.images ?? 0
  try {
    await admin.from('ai_usage_events').insert({
      run_id: ctx.runId,
      step: entry.step,
      provider: ctx.preset.provider === 'openai' && OPENAI_API_KEY ? 'openai' : 'lovable',
      model: entry.model,
      input_tokens: entry.input_tokens ?? 0,
      output_tokens: entry.output_tokens ?? 0,
      images: entry.images ?? 0,
      cost_usd: Number(entry.cost_usd.toFixed(6)),
      cost_brl: Number(cost_brl.toFixed(4)),
      duration_ms: entry.duration_ms,
      success: entry.success ?? true,
    })
  } catch {
    // registro de custo nunca derruba a rodada
  }
}

async function chat(ctx: Ctx, step: string, messages: unknown[], schemaName: string, schema: unknown) {
  const model = ctx.preset.text_model
  const started = Date.now()
  const res = await fetch(endpoint(ctx.preset, '/chat/completions'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey(ctx.preset)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools: [{ type: 'function', function: { name: schemaName, parameters: schema } }],
      tool_choice: { type: 'function', function: { name: schemaName } },
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    await logUsage(ctx, { step, model, cost_usd: 0, duration_ms: Date.now() - started, success: false })
    throw Object.assign(new Error(`AI ${res.status}: ${text}`), { status: res.status })
  }
  const json = await res.json()
  const inputTokens = json?.usage?.prompt_tokens ?? 0
  const outputTokens = json?.usage?.completion_tokens ?? 0
  await logUsage(ctx, {
    step,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: textCostUsd(model, inputTokens, outputTokens),
    duration_ms: Date.now() - started,
  })
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments
  if (!args) throw new Error('AI returned no structured output')
  return JSON.parse(args)
}

async function generateImage(ctx: Ctx, prompt: string): Promise<string | null> {
  const model = ctx.preset.image_model
  const started = Date.now()
  const useOpenAI = ctx.preset.provider === 'openai' && OPENAI_API_KEY
  const body = useOpenAI
    ? { model, prompt, size: '1024x1024', n: 1 }
    : { model, messages: [{ role: 'user', content: prompt }], modalities: ['image', 'text'] }
  const res = await fetch(endpoint(ctx.preset, '/images/generations'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey(ctx.preset)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    await logUsage(ctx, { step: 'imagem', model, cost_usd: 0, duration_ms: Date.now() - started, success: false })
    throw Object.assign(new Error(`Image ${res.status}: ${text}`), { status: res.status })
  }
  const json = await res.json()
  await logUsage(ctx, { step: 'imagem', model, images: 1, cost_usd: imageCostUsd(model, 1), duration_ms: Date.now() - started })
  return json?.data?.[0]?.b64_json ?? null
}

async function uploadImage(b64: string, path: string) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const { error } = await admin.storage.from('instagram-creatives').upload(path, bytes, { contentType: 'image/png', upsert: true })
  if (error) throw error
  return path
}

/** Platform admin, membro (qualquer papel) da Casa da campanha, ou vendedor vinculado à unidade do item. */
async function authorize(req: Request, casaId: string, unidadeId: string | null): Promise<{ userId: string } | Response> {
  const auth = req.headers.get('authorization') ?? ''
  const token = /^Bearer (.+)$/.exec(auth)?.[1]
  if (!token) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  if (token === SERVICE_KEY) return { userId: 'service' }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return new Response('Unauthorized', { status: 401, headers: corsHeaders })
  const userId = data.user.id

  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: userId, _role: 'admin' })
  if (isAdmin) return { userId }

  const { data: isCasaMember } = await admin.rpc('is_casa_member', { _user_id: userId, _casa_id: casaId })
  if (isCasaMember) return { userId }

  if (unidadeId) {
    const { data: belongs } = await admin.rpc('user_belongs_to_unidade', { _user_id: userId, _unidade_id: unidadeId })
    if (belongs) return { userId }
  }
  return new Response('Forbidden', { status: 403, headers: corsHeaders })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let runId: string | null = null
  let ctx: Ctx | null = null
  try {
    const body = (await req.json()) as {
      campanha_id?: string
      campanha_item_id?: string
      format?: 'card' | 'carousel' | 'story'
      preset_id?: string
      contact_keys?: string[]
      brief?: string
    }
    const { campanha_id, campanha_item_id, format, preset_id, contact_keys, brief } = body
    if (!campanha_id || !campanha_item_id || !format || !preset_id) {
      throw Object.assign(new Error('campanha_id, campanha_item_id, format e preset_id são obrigatórios'), { status: 400 })
    }

    const { data: campanha, error: campanhaErr } = await admin
      .from('campanhas')
      .select('id, casa_id, nome, escopo')
      .eq('id', campanha_id)
      .single()
    if (campanhaErr || !campanha) throw Object.assign(new Error('Campanha não encontrada'), { status: 404 })

    const { data: item, error: itemErr } = await admin
      .from('campanha_itens')
      .select('id, nome, unidade_id, dados')
      .eq('id', campanha_item_id)
      .single()
    if (itemErr || !item) throw Object.assign(new Error('Item de campanha não encontrado'), { status: 404 })

    const authResult = await authorize(req, campanha.casa_id, item.unidade_id)
    if (authResult instanceof Response) return authResult

    const { data: presetRow, error: presetErr } = await admin.from('agent_presets').select('*').eq('id', preset_id).single()
    if (presetErr || !presetRow) throw Object.assign(new Error('Preset não encontrado'), { status: 404 })
    const preset = presetRow as Preset
    if (preset.casa_id !== campanha.casa_id) throw Object.assign(new Error('Preset não pertence a esta Casa'), { status: 400 })

    const spec = preset.template_spec?.[format]
    if (!spec || spec.fields.length === 0) {
      throw Object.assign(new Error(`Preset "${preset.name}" ainda não tem campos definidos para o formato ${format}`), { status: 400 })
    }

    ctx = { runId: null, preset, totals: { usd: 0, brl: 0, tokens: 0, images: 0 } }

    let unidade: { nome: string; cidade: string; contatos: Record<string, string> } | null = null
    if (item.unidade_id) {
      const { data: u } = await admin.from('unidades').select('nome, cidade, contatos').eq('id', item.unidade_id).single()
      unidade = u ?? null
    }

    // Contato: nunca escrito/inventado pela IA — vem da unidade (por_unidade) ou do contato
    // geral do item (geral), e só entram os campos que o usuário escolheu na tela de geração.
    const CONTACT_LABELS: Record<string, string> = { telefone: 'Tel', whatsapp: 'WhatsApp', email: 'E-mail', endereco: 'Endereço' }
    const contactSource: Record<string, string> =
      unidade?.contatos ?? (item.dados as { contato_geral?: Record<string, string> })?.contato_geral ?? {}
    const chosenKeys = (contact_keys?.length ? contact_keys : Object.keys(contactSource)).filter((k) => contactSource[k])
    const contactText = chosenKeys.map((k) => `${CONTACT_LABELS[k] ?? k}: ${contactSource[k]}`).join('  ·  ')

    const { data: run, error: runErr } = await admin
      .from('instagram_runs')
      .insert({
        status: 'drafting',
        casa_id: campanha.casa_id,
        campanha_id: campanha.id,
        campanha_item_id: item.id,
        preset_id: preset.id,
        created_by: authResult.userId !== 'service' ? authResult.userId : null,
        topic_title: `${campanha.nome} — ${item.nome}`,
        topic_summary: unidade ? `Unidade: ${unidade.nome} (${unidade.cidade})` : null,
      })
      .select()
      .single()
    if (runErr) throw runErr
    runId = run.id
    ctx.runId = runId

    // RAG escopado: policies/guardrails da Casa/campanha sempre por inteiro + retrieval semântico
    const knowledgeBlocks: string[] = []
    try {
      const { data: hardRules } = await admin
        .from('knowledge_documents')
        .select('id, title, doc_type, casa_id, campanha_id, unidade_id')
        .eq('active', true)
        .eq('status', 'ready')
        .in('doc_type', ['policies', 'guardrails'])
      for (const doc of hardRules ?? []) {
        if (doc.casa_id && doc.casa_id !== campanha.casa_id) continue
        if (doc.campanha_id && doc.campanha_id !== campanha.id) continue
        if (doc.unidade_id && doc.unidade_id !== item.unidade_id) continue
        const { data: parts } = await admin.from('knowledge_chunks').select('content').eq('document_id', doc.id).order('chunk_index').limit(12)
        const full = (parts ?? []).map((p) => p.content).join('\n')
        if (full.trim()) knowledgeBlocks.push(`### ${doc.title} (${doc.doc_type})\n${full.slice(0, 6000)}`)
      }

      const queryText = `${campanha.nome}\n${item.nome}\n${JSON.stringify(item.dados ?? {})}`
      const startedAt = Date.now()
      const [queryEmbedding] = await embedTexts([queryText])
      const { data: matches } = await admin.rpc('match_knowledge_chunks', {
        query_embedding: toVectorLiteral(queryEmbedding),
        match_count: 8,
        filter_doc_types: ['brand_manual', 'design_system', 'writing_manual', 'copy_semantic', 'copy_syntactic', 'copy_lexical', 'copy_reference'],
        filter_preset: null,
        filter_casa: campanha.casa_id,
        filter_campanha: campanha.id,
        filter_unidade: item.unidade_id,
      })
      for (const m of (matches ?? []) as { title: string; doc_type: string; content: string }[]) {
        knowledgeBlocks.push(`### ${m.title} (${m.doc_type})\n${m.content}`)
      }
      await logUsage(ctx, {
        step: 'knowledge_retrieval',
        model: EMBEDDING_MODEL,
        input_tokens: Math.ceil(queryText.length / 4),
        cost_usd: 0.0000002 * Math.ceil(queryText.length / 4),
        duration_ms: Date.now() - startedAt,
      })
    } catch (e) {
      console.error('knowledge retrieval falhou', (e as Error).message)
    }
    const knowledgeContext = knowledgeBlocks.length
      ? `\n\nMATERIAL OFICIAL DA CAMPANHA (siga rigorosamente; policies e guardrails são obrigatórios; use o método DEL — padrão semântico/sintático/lexical e referência de texto):\n${knowledgeBlocks.join('\n\n').slice(0, 20000)}`
      : ''

    // Schema dinâmico: um campo de string por campo do template_spec, nada de layout —
    // a IA só escreve o texto que cabe em cada caixa já desenhada pelo designer.
    // Campos "dataBound" (ex.: contato) ficam de fora — são preenchidos com dado real, não pela IA.
    const aiFields = spec.fields.filter((f) => !f.dataBound)
    const fieldProps = Object.fromEntries(
      aiFields.map((f) => [f.key, { type: 'string', description: `${f.label}${f.maxLines ? ` — no máx. ${f.maxLines} linha(s), seja bem conciso` : ''}` }]),
    )
    const slideSchema = { type: 'object', properties: fieldProps, required: aiFields.map((f) => f.key) }
    const slideCount = format === 'carousel' ? Math.max(2, preset.carousel_slides || 4) : 1

    const itemContext =
      campanha.escopo === 'por_unidade'
        ? `Unidade: ${unidade?.nome ?? item.nome} (${unidade?.cidade ?? ''}).\nDados da unidade: ${JSON.stringify(item.dados)}.\nContatos: ${JSON.stringify(unidade?.contatos ?? {})}.`
        : `Serviço: ${item.nome}.\nDetalhes: ${JSON.stringify(item.dados)}.`

    const draft = (await chat(
      ctx,
      'criativo',
      [
        {
          role: 'system',
          content:
            (preset.instructions?.trim() || `Você escreve criativos de Instagram para a campanha "${campanha.nome}".`) +
            ` Preencha APENAS os campos de texto pedidos, nunca invente dados fora do material fornecido, respeite rigorosamente o limite de linhas de cada campo (frases curtas, direto ao ponto).` +
            knowledgeContext,
        },
        {
          role: 'user',
          content:
            `Campanha: ${campanha.nome}\n${itemContext}\n\n` +
            `Gere ${slideCount} slide(s) para o formato "${format}". Cada slide segue exatamente os mesmos campos.` +
            (format === 'carousel' ? ' Varie o conteúdo entre os slides mantendo uma progressão lógica (gancho no primeiro, fechamento/contato no último).' : '') +
            (brief?.trim() ? `\n\nFoco pedido para esta geração (direciona o conteúdo, nunca muda o layout nem ignora as regras acima): ${brief.trim()}` : ''),
        },
      ],
      'preencher_template',
      {
        type: 'object',
        properties: {
          caption: { type: 'string', description: 'Legenda do post' },
          hashtags: { type: 'array', items: { type: 'string' } },
          slides: { type: 'array', items: slideSchema, minItems: slideCount, maxItems: slideCount },
        },
        required: ['caption', 'hashtags', 'slides'],
      },
    )) as { caption: string; hashtags: string[]; slides: Record<string, string>[] }

    // Imagem: banco da campanha/item primeiro, geração por IA só como fallback — nunca busca de terceiros.
    const { data: bankImages } = await admin
      .from('imagens_banco')
      .select('storage_path')
      .eq('casa_id', campanha.casa_id)
      .or(`campanha_item_id.eq.${item.id},and(campanha_id.eq.${campanha.id},campanha_item_id.is.null)`)
      .limit(8)
    const pool = (bankImages ?? []).map((b) => b.storage_path as string)

    const dataBoundFields = spec.fields.filter((f) => f.dataBound)
    let imageBudget = preset.image_budget ?? 6
    const slides = draft.slides.map((values, i) => ({
      order: i + 1,
      values: dataBoundFields.length
        ? { ...values, ...Object.fromEntries(dataBoundFields.map((f) => [f.key, contactText])) }
        : values,
    }))
    if (spec.imageSlot) {
      for (let i = 0; i < slides.length; i++) {
        if (pool.length > 0) {
          ;(slides[i] as { image_url?: string }).image_url = pool[i % pool.length]
          continue
        }
        if (imageBudget <= 0) continue
        imageBudget--
        try {
          const imagePrompt = `Background image for a "${campanha.nome}" social media creative. Context: ${itemContext}. Editorial, professional, no text, no letters, no watermark, matches an institutional brand.`
          const b64 = await generateImage(ctx, imagePrompt)
          if (b64) {
            ;(slides[i] as { image_url?: string }).image_url = await uploadImage(b64, `${runId}/${format}-${i + 1}-${crypto.randomUUID()}.png`)
          }
        } catch (e) {
          const status = (e as { status?: number }).status
          if (status === 402 || status === 403) throw e
        }
      }
    }

    const { error: creativeErr } = await admin.from('instagram_creatives').insert({
      run_id: runId,
      format,
      caption: draft.caption,
      hashtags: draft.hashtags ?? [],
      slides,
      campanha_item_id: item.id,
      preset_id: preset.id,
    })
    if (creativeErr) throw creativeErr

    await admin
      .from('instagram_runs')
      .update({
        status: 'pending_review',
        cost_usd: Number(ctx.totals.usd.toFixed(6)),
        cost_brl: Number(ctx.totals.brl.toFixed(4)),
        tokens_total: ctx.totals.tokens,
        image_count: ctx.totals.images,
      })
      .eq('id', runId)

    return new Response(
      JSON.stringify({ run_id: runId, format, cost_usd: Number(ctx.totals.usd.toFixed(6)), cost_brl: Number(ctx.totals.brl.toFixed(4)) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const message = (e as Error).message ?? 'Erro desconhecido'
    if (runId) {
      await admin
        .from('instagram_runs')
        .update({
          status: 'failed',
          error_message: message.slice(0, 500),
          cost_usd: ctx ? Number(ctx.totals.usd.toFixed(6)) : 0,
          cost_brl: ctx ? Number(ctx.totals.brl.toFixed(4)) : 0,
          tokens_total: ctx?.totals.tokens ?? 0,
          image_count: ctx?.totals.images ?? 0,
        })
        .eq('id', runId)
    }
    const status = (e as { status?: number }).status
    return new Response(JSON.stringify({ error: message }), {
      status: status && status >= 400 ? status : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
