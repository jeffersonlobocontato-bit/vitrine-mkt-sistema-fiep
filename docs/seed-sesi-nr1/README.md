# Pacote de teste: Sesi · Segurança e Saúde · NR-1

Serviço fictício pra validar o fluxo ponta a ponta (campanha → item → preset → gerar → aprovar → baixar), baseado na peça de referência real que você mandou ("Especialistas do Sesi... NR-01").

## Checklist — o que já está pronto vs. o que falta fazer

### ✅ Já preenchido por SQL (sem precisar de IA)
Rode `seed.sql` no SQL editor do Lovable Cloud (mesmo lugar de sempre — é idempotente, pode rodar mais de uma vez):
- [x] Campanha **"Segurança e Saúde"** (Sesi, escopo geral)
- [x] Item **"NR-1 — Gerenciamento de Riscos Ocupacionais"**
- [x] Preset **"Especialistas do Sesi — NR-1 (teste)"**, já com:
  - `instructions` completas (tom, regras, contexto) — funciona mesmo sem nenhum documento na biblioteca ainda
  - `template_spec` do formato **Card** todo mapeado (3 campos de texto + slot de imagem com máscara de canto arredondado), calculado a partir da análise da imagem de referência

### 🔲 Precisa de você, pela interface (upload/paste dispara processamento)
1. **Subir a arte de referência do Card**: Admin → `/casa/sesi` → Presets → abrir "Especialistas do Sesi — NR-1 (teste)" → aba Card → "Enviar arte" → suba a própria imagem que você me mandou (ou uma versão sem o texto, só o fundo+foto, se preferir — o texto do card real vira só referência visual, o fundo dela é o que efetivamente aparece nas gerações).
2. **Colar os 9 documentos da biblioteca** (`01` a `09` nesta pasta) em Admin → `/casa/sesi` → Biblioteca → "Ou cole o texto", um de cada vez, escolhendo o tipo certo:
   | Arquivo | Tipo (doc_type) |
   |---|---|
   | `01-brand-manual.md` | Manual da marca |
   | `02-design-system.md` | Design system |
   | `03-writing-manual.md` | Manual de redação |
   | `04-copy-semantico.md` | Padrão semântico de copy |
   | `05-copy-sintatico.md` | Padrão sintático de copy |
   | `06-copy-lexico.md` | Padrão lexical de copy |
   | `07-copy-referencia.md` | Referência de texto |
   | `08-policies.md` | Policies |
   | `09-guardrails.md` | Guardrails |

   Isso dispara o processamento automático (chunking + embeddings) — acompanhe o status virar "pronto" antes de testar.

3. **(Opcional) Imagens no banco**: se quiser testar com foto de verdade em vez de deixar a IA gerar, suba 1-2 fotos em Admin → Campanhas → (ainda não tem UI de upload pro banco de imagens nesta fase — por enquanto, sem imagem no banco, a geração usa IA se `OPENAI_API_KEY` estiver configurada, ou fica só com o fundo/texto se não estiver).

## Depois de fazer isso, testar
1. Vá em `/casa/sesi` → "Gerar criativo".
2. Campanha: **Segurança e Saúde** → Item: **NR-1 — Gerenciamento de Riscos Ocupacionais** → Formato: **Card** → Preset: **Especialistas do Sesi — NR-1 (teste)**.
3. Clique em **Gerar**. A IA deve escrever os 3 campos (título, subtítulo, palavra-chave) respeitando o preset, puxando o tom das `instructions` (e da biblioteca, se já processada).
4. Aprovar → baixar o PNG final.

## Nota sobre o "método DEL"
Os documentos `04`, `05` e `06` (padrão semântico/sintático/lexical) são um **rascunho genérico** pra popular o teste — não é o método DEL real da equipe, que ainda não foi definido. Quando tiver o conteúdo oficial, é só desativar esses 3 e colar os novos no lugar (mesmo tipo de documento).
