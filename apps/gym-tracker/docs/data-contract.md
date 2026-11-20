# Contrato de dados

| Tabela | Papel | Invariantes |
|---|---|---|
| `users` | proprietário | mensagens e imports nunca cruzam usuários |
| `imports` | arquivo ingerido | SHA-256 único por usuário |
| `raw_messages` | mensagem canônica | identidade única por usuário |
| `import_message_occurrences` | aparição no export | posição única dentro do arquivo |
| `parse_runs` | execução versionada | uma execução por import/versão |
| `parse_results` | resultado derivado | no máximo um ativo por mensagem |
| `parse_reviews` | decisão humana | estado único, payload e `reviewed_at` |
| `workouts` | sessão derivada | preservada para auditoria |
| `sets` | série derivada | pertence a um parse result |
| `exercises` | exercício canônico | nome e grupo muscular |
| `exercise_variants` | execução | equipamento e base da carga |
| `exercise_aliases` | decisão aprendida | global ou por usuário |
| `data_revisions` | versão visível | invalida o cache do dashboard |

O bootstrap do CSV pode preencher somente `exercises`, `exercise_variants` e
`exercise_aliases`. Ele não escreve em nenhuma tabela de origem ou resultado da
pipeline. A coluna `peso_kg` confirma que a unidade legada é quilograma, mas
nenhum peso do CSV é persistido; `load_basis` pertence exclusivamente à variante.

## Estados

`parse_results.status`: `accepted`, `review`, `skipped`, `reused` ou `rejected`.

`parse_results.is_active=true` significa que suas séries alimentam o dashboard. Um resultado aceito antigo pode permanecer auditável com `is_active=false`.

Métodos de extração:

- `rule`: parser determinístico;
- `llm`: proposta validada e explicitamente autoaceita;
- `manual`: revisão humana aceita.

## Cargas

O valor persistido usa quilogramas. `500g` vira `0,5kg`; ponto e vírgula decimais são aceitos. Os limites centralizados são `0,1kg` a `500kg`. Valores fora desse intervalo nunca são materializados sem correção humana. `22.5g` é literalmente `0,0225kg` e gera uma sugestão de possível erro de unidade, sem correção automática.

Para `equipment="Peso corporal"` e `load_basis="adicional"`, zero quilogramas
significa nenhuma carga adicional, sem estimar o peso da pessoa. Somente essa
combinação permite materializar carga zero. Séries e repetições entram nas
contagens; o volume usa apenas a carga adicional.

## Dashboard

O adapter retorna apenas resultados ativos, com uma linha por série:

`data`, `grupo_muscular`, `exercicio`, `tipo`, `peso_kg`, `serie`, `repeticoes`.

As colunas `volume`, `semana`, `mes` e `exercicio_tipo` são derivadas. A semana vai de segunda a domingo.

Os gráficos que comparam músculos usam uma cor fixa por grupo, compartilhada
entre as abas e preservada ao aplicar filtros. Gráficos por métrica ou número
de série usam as cores das respectivas legendas.

A aba **Últimos treinos** usa as cinco datas mais recentes do grupo muscular
selecionado, dentro dos filtros da barra lateral. A escolha de exercício no
gráfico não muda essas datas. Exercícios e aparelhos ficam separados; ausência
de registro aparece como lacuna, sem ser convertida em zero. Cada linha do
gráfico corresponde ao número da série registrada: primeira azul, segunda
verde e terceira vermelha; séries adicionais recebem outras cores. Carga,
repetições e volume são exibidos por série. Os insights abaixo do gráfico
comparam as duas datas mais recentes do grupo, sem buscar um treino mais
antigo para preencher ausências. Neles, a melhor série é a de maior carga e,
no empate, maior número de repetições, sempre da mesma série registrada.
