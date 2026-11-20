# Operação, parsing e revisão

## Variáveis

- `DATABASE_URL`: conexão SQLAlchemy.
- `DATA_BACKEND`: use `postgres`; o backend `csv` é rejeitado para o dashboard.
- `GYM_TRACKER_USER_ID`: usuário mostrado no dashboard.
- `OPENAI_API_KEY`: opcional.
- `OPENAI_MODEL`: modelo auditado no parse run.
- `LLM_SHADOW_MODE`: `true` por padrão.
- `LLM_AUTO_ACCEPT`: `false` por padrão.
- `PARSER_VERSION`: versão lógica do parser, atualmente `3.0.2`.

## Importação e reprocessamento

```bash
uv run python -m gym_tracker.cli import-whatsapp --file export.txt --user UUID
uv run python -m gym_tracker.cli import-whatsapp --file export.txt --user UUID --parser-version 3.1.0
uv run python -m gym_tracker.cli quality-report --import-id UUID
```

O mesmo arquivo/versão retorna `duplicate_import=true`. Uma nova versão cria outro parse run. Em exports sobrepostos, a ocorrência é registrada no novo import e a mensagem anterior é reutilizada.

## Formatos do WhatsApp

São aceitos cabeçalhos com ano de dois ou quatro dígitos, segundos opcionais e estas formas:

```text
[24/07/2026, 13:45:12] Nome: mensagem
[24/07/2026 13:45] Nome: mensagem
24/07/2026 13:45 - Nome: mensagem
24/07/2026, 13:45:12 - Nome: mensagem
[8/13/26, 6:16:15 PM] Nome: mensagem
8/13/26, 6:16 PM - Nome: mensagem
```

Datas inequívocas, como `8/13/26` ou `24/07/2026`, determinam a ordem de dia e
mês de todo o export. Quando todas as datas são ambíguas, horários com AM/PM
usam mês/dia; o formato de 24 horas mantém dia/mês. Um arquivo que mistura as
duas ordens é recusado. AM/PM aceita também o espaço estreito usado pelo iPhone.

Mensagens multilinha e múltiplos exercícios são preservados. Só são juntadas linhas iniciadas por reticências ou continuações compostas claramente apenas por repetições. Texto livre separado vai para revisão. Marcadores de edição, exclusão e mídia ficam na origem.

## Séries, observações e equipamentos na versão 3.0.2

- `nfiz`, `n fiz`, `não fiz` e `naofiz` identificam exercícios não realizados,
  inclusive dentro de parênteses. Eles não geram séries; os demais exercícios
  da mensagem são preservados.
- Multiplicadores exigem o `x`: `40kg/10rep/3x` representa três séries de dez.
  A forma `40kg/10rep/3` é ambígua e vai para revisão, sem multiplicar nem
  assumir duas séries. Para duas séries com quatro repetições, escreva
  `40kg/4rep/4rep`.
- Repetições zero, negativas, fracionárias, acima de 200 ou incompletas geram
  revisão. Valores válidos vizinhos permanecem na proposta, e a mensagem
  inteira aguarda a decisão humana. Nenhuma série parcial é ativada.
- Multiplicadores fora de 1 a 200 ou múltiplos multiplicadores também exigem
  revisão, evitando expansão ilimitada de uma anotação inválida.
- `Máquina com anilha` e `maq com anilhas` preservam o equipamento específico.
  O equipamento escrito no exercício tem precedência sobre o título do bloco.
- Cargas malformadas como `15..8kg` exigem revisão, sem interpretar apenas
  `8kg` nem inventar a posição da casa decimal.

Esses motivos de revisão bloqueiam a autoaceitação por IA, mesmo quando ela
propõe valores plausíveis. Resolver um alias não remove a evidência de uma
repetição inválida.

Publicar a nova versão não atualiza o `.env` da instalação anterior. Não mude
`PARSER_VERSION` no importador ativo apenas para testar: a mudança solicita uma
nova análise do TXT. Antes de adotar a versão, faça backup e compare os
resultados em uma cópia do banco, preservando as correções humanas. Resultados
que exigem revisão mantêm a versão aceita anterior ativa. A ativação no banco
pessoal e o reprocessamento do histórico são operações separadas da correção
do código.

## Revisões

```bash
uv run python -m gym_tracker.cli list-reviews --status pending --json
uv run python -m gym_tracker.cli show-review --review-id UUID --json
uv run python -m gym_tracker.cli accept-review --review-id UUID --payload correcao.json
uv run python -m gym_tracker.cli accept-review --review-id UUID --payload correcao.json --save-alias "mov x"
uv run python -m gym_tracker.cli reject-review --review-id UUID
```

A listagem mostra data, motivo, método, trecho limitado, proposta e status. O detalhe mostra conteúdo original, origem, payloads e resumo das diferenças. Aceitar ou rejeitar uma revisão finalizada novamente é erro. Aceitar materializa e ativa transacionalmente; rejeitar preserva qualquer resultado ativo anterior.

## Comparação legada

O comparador normaliza Unicode, acentos, caixa, espaços, equipamento e números. Diferenças apenas visuais não contam como alteração. Equipamentos ou séries realmente diferentes continuam aparecendo.

## Bootstrap do catálogo pelo CSV

O CSV legado é uma fonte auxiliar de catálogo, nunca uma fonte de treinos. Antes
de aplicar, execute o dry-run:

```bash
uv run python -m gym_tracker.cli bootstrap-catalog \
  --file academia_treinos_whatsapp.csv \
  --user UUID
```

O relatório informa linhas, duplicatas, associações unívocas, ambiguidades, itens
não encontrados e registros planejados. Para aplicar somente as associações
unívocas:

```bash
uv run python -m gym_tracker.cli bootstrap-catalog \
  --file academia_treinos_whatsapp.csv \
  --user UUID \
  --apply
```

O bootstrap agrega todas as linhas equivalentes antes de decidir. Nomes usam uma
chave Unicode sem diferenças de acento, caixa, pontuação irrelevante ou espaços;
o nome canônico legível já existente é preservado. Equipamento, grupo, unidade
e `load_basis` só são confirmados quando há um único valor consistente.
Conflitos e nomes sem correspondência determinística ficam no relatório, sem
escolha por frequência.

O comando é transacional e idempotente. Ele pode criar ou reutilizar exercícios,
aliases do usuário e variantes, mas nunca cria `workouts`, `sets`, mensagens,
imports, parse runs ou parse results. Para repetir a validação, use um banco
PostgreSQL descartável, aplique migrations até `head`, rode dry-run, aplicação e
uma segunda aplicação, e confirme que as tabelas da pipeline continuam vazias.

## Limitações

- revisão humana ainda usa CLI/JSON;
- não há autenticação web;
- correlação de exports com precisão temporal diferente é conservadora;
- duas variantes históricas confirmadas tornam o equipamento ambíguo;
- LLM autoaceita somente com duas configurações explícitas e continua sendo uma opção de alto controle.
