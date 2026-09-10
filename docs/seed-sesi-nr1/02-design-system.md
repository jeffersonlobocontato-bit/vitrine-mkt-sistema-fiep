# Design system — peças de campanha (Sesi)

Extraído da análise do card de referência "Especialistas do Sesi — NR-01".

## Estrutura do Card (1080x1350)
1. **Header** (0–9% da altura): logo Sistema Fiep + Sesi, branco, alinhado à esquerda.
2. **Linha de destaque**: filete fino na cor de campanha, largura total, logo abaixo do header.
3. **Bloco de texto** (8% de margem esquerda, ocupa a metade/dois terços superiores esquerdos):
   - Título de destaque (cor de campanha, bold, 2 linhas)
   - Subtítulo de apoio (branco, bold, menor)
   - Palavra-chave/número em super destaque (branco, tamanho muito maior que o resto — é o elemento que mais chama atenção no card)
4. **Foto** (canto inferior-direito, ~55% da largura, ~46% da altura): sempre uma foto real de pessoa/ambiente relacionado ao serviço, nunca ilustração genérica.
   - **Máscara**: canto superior-esquerdo bem arredondado (raio grande, ~13% da largura da foto), os outros 3 cantos retos (a foto sangra até a borda direita e inferior do card).
   - **Borda**: contorno fino (3–4px na resolução de exportação) na cor de campanha, seguindo o recorte arredondado.
5. **Textura decorativa**: pontos/tracinhos sutis na cor de campanha, no canto inferior-esquerdo, abaixo do bloco de texto — puramente decorativo, faz parte da arte de fundo, não é um campo dinâmico.

## Regra de composição
O fundo (gradiente + logo + textura decorativa) é sempre uma arte fixa, produzida pelo design. A foto é a única peça que muda de verdade a cada geração — ela entra "por trás" dos elementos gráficos, dentro da janela recortada. Texto nunca é colocado sobre a foto diretamente; ele sempre fica na área de fundo sólido/gradiente, garantindo contraste e legibilidade.

## Hierarquia tipográfica
- Palavra-chave (ex.: "NR-01"): a maior fonte do card, dominante — é o "gancho" que a pessoa lê primeiro ao passar o olho.
- Título de destaque: segunda maior, cor de campanha.
- Subtítulo: terceira, branco, serve de conexão entre o título e a palavra-chave.
