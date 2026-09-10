import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1]
    if (!token) return json({ error: 'Não autenticado' }, 401)
    const { data: caller, error: callerErr } = await admin.auth.getUser(token)
    if (callerErr || !caller.user) return json({ error: 'Não autenticado' }, 401)

    const body = (await req.json().catch(() => ({}))) as {
      email?: string
      password?: string
      display_name?: string
      casa_ids?: string[]
      role?: 'designer' | 'social_media' | 'gestor'
      unidade_id?: string | null
    }

    const email = (body.email ?? '').trim().toLowerCase()
    const password = body.password ?? ''
    if (!email || !password || password.length < 8) {
      return json({ error: 'Informe e-mail e uma senha com pelo menos 8 caracteres' }, 400)
    }

    // Permissão: admin da plataforma ou gestor de Casa
    const { data: isPlatformAdmin } = await admin.rpc('has_role', { _user_id: caller.user.id, _role: 'admin' })
    let allowedCasaIds: string[] | null = null
    if (!isPlatformAdmin) {
      const { data: memberships } = await admin
        .from('casa_members')
        .select('casa_id')
        .eq('user_id', caller.user.id)
        .eq('role', 'gestor')
      allowedCasaIds = (memberships ?? []).map((m: { casa_id: string }) => m.casa_id)
      if (allowedCasaIds.length === 0) return json({ error: 'Sem permissão para cadastrar usuários' }, 403)
    }

    const casaIds = (body.casa_ids ?? []).filter((id) => !allowedCasaIds || allowedCasaIds.includes(id))
    let unidadeId = body.unidade_id ?? null
    if (unidadeId && allowedCasaIds) {
      const { data: unidade } = await admin.from('unidades').select('casa_id').eq('id', unidadeId).maybeSingle()
      if (!unidade || !allowedCasaIds.includes(unidade.casa_id)) unidadeId = null
    }

    // Cria (ou reaproveita) o usuário
    let userId: string | null = null
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: body.display_name ? { display_name: body.display_name } : undefined,
    })
    if (createErr) {
      const alreadyExists = /already|exist|registered/i.test(createErr.message)
      if (!alreadyExists) return json({ error: createErr.message }, 400)
      const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
      if (!existing) return json({ error: 'E-mail já cadastrado em outra conta' }, 400)
      userId = existing.id
    } else {
      userId = created.user?.id ?? null
    }
    if (!userId) return json({ error: 'Não foi possível criar o usuário' }, 500)

    await admin
      .from('profiles')
      .upsert({ id: userId, email, display_name: body.display_name ?? null }, { onConflict: 'id' })

    if (casaIds.length > 0) {
      const { error } = await admin
        .from('casa_members')
        .upsert(
          casaIds.map((casa_id) => ({ casa_id, user_id: userId, role: body.role ?? 'social_media' })),
          { onConflict: 'casa_id,user_id' },
        )
      if (error) return json({ error: error.message }, 400)
    }

    if (unidadeId) {
      const { error } = await admin.from('user_units').insert({ user_id: userId, unidade_id: unidadeId })
      if (error && !/duplicate/i.test(error.message)) return json({ error: error.message }, 400)
    }

    return json({ user_id: userId, created: !createErr })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
