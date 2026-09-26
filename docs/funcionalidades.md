# Funcionalidades

## Funcionalidades

### Atividades

- Criação, edição, pesquisa, arquivamento e reativação.
- Nome, cor, ícone, descrição, horário e duração padrão.
- Duração informada como `HH:MM`, por exemplo `02:30`.
- Alterações de horário e duração atualizam ocorrências planejadas que ainda usam os padrões anteriores.
- Ocorrências personalizadas, concluídas ou puladas são preservadas.

### Semana

- Planejamento de segunda-feira a domingo.
- Biblioteca lateral com pesquisa e drag and drop.
- Adição alternativa por seletor para dispositivos sem arraste.
- Reordenação e movimentação entre dias.
- Eventos separados das atividades.
- Resumo com totais e percentuais de atividades concluídas e puladas.
- **Copiar semana** copia diretamente as atividades da semana aberta para a próxima.
- **Limpar semana** remove as ocorrências da semana aberta após confirmação, preservando eventos e a biblioteca.

### Dia

- Agenda vertical de `00:00` a `23:00`.
- Atividades e eventos posicionados conforme horário e duração.
- Rolagem automática para o primeiro item com horário.
- Painéis laterais para atividades flexíveis e atividades com horário.
- Ações para concluir, pular, reabrir e editar.

### Mês

- Calendário completo começando na segunda-feira.
- Atividades, eventos e estados visíveis em cada dia.
- Atalhos para abrir o dia ou a semana correspondente.

### Acompanhamento

- Filtros por período, múltiplas atividades e múltiplos estados.
- Total de planejadas, concluídas e puladas.
- Taxa de conclusão.
- Tempo investido por atividade, comparando o tempo concluído com o total planejado da própria atividade.
- Comparação entre as semanas 1–5 do mês.
- Comparação do volume de atividades por mês.
- Eventos e ocorrências futuras não entram nos indicadores.

### Modelos e repetições

- Salvar uma semana como modelo.
- Aplicar modelos sem recriar duplicatas.
- Criar repetições por dias da semana e intervalo.
- Cancelar ocorrências futuras de uma repetição sem apagar o histórico anterior.

## Evolução no xadrez

Em **Acompanhamento → Xadrez**, informe seu usuário do Chess.com e clique em
**Conectar e importar**. Nenhuma senha ou chave de API é necessária. A tela
separa Rápida, Blitz, Bullet e Diária, com rating atual, recorde, resultados e
gráfico por período. O gráfico usa a última pontuação registrada por dia.

A primeira importação cobre os últimos 12 meses de calendário, incluindo o mês
atual. Atualizações são manuais e revisitam essa janela para refletir correções;
pontos mais antigos já importados permanecem salvos. “Todo o histórico importado”
não significa todo o histórico da conta. Há um intervalo mínimo de cinco minutos
entre atualizações bem-sucedidas. O Chess.com pode entregar dados em cache por
até 24 horas.

Após atualizar o código, prepare as novas tabelas:

```powershell
npm.cmd run db:generate
npm.cmd run db:deploy
npm.cmd run dev
```

Opcionalmente, atualize pelo terminal:

```powershell
npm.cmd run chess:sync -- seu-usuario
```

Uma conta Chess.com fica associada ao Planner pessoal. Uma conta diferente não
substitui silenciosamente o histórico existente. As consultas são sequenciais,
feitas pelo servidor, e falhas preservam a última importação válida. Abrir a
tela consulta apenas o histórico local.

A academia foi analisada a partir do chat do Gym Tracker; a integração ainda
depende de uma API de exportação naquele projeto. Veja o
[contrato proposto](gym-tracker-integration.md).

Fonte: [API pública oficial do Chess.com](https://www.chess.com/news/view/published-data-api).
