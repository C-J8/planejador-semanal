# Integração futura: Planner e Gym Tracker

O chat **Acompanhar evolução na academia** descreve um projeto separado em
`E:\trabalhos\Acad`: Python, Streamlit e PostgreSQL. O pipeline importa TXT do
WhatsApp, normaliza mensagens, passa por parsing/revisão e apresenta séries
aceitas e ativas. O chat não identifica uma API de exportação pronta.

## Escopo recomendado

Adicionar uma API JSON somente leitura ao Gym Tracker, consumida pelo servidor
do Planner. O Gym Tracker continua sendo a fonte dos dados. Não compartilhar
credenciais de escrita nem replicar textos de WhatsApp no Planner.

Começar por dias de treino, volume por exercício e evolução de carga. Comparar
sempre a mesma variante de exercício, equipamento e base de carga (por halter
ou total). Uma estimativa de 1RM exige definição e versão da fórmula antes de
ser integrada; ela não representa um teste físico medido.

## Contrato proposto, ainda não implementado

`GET /api/v1/progress?from=YYYY-MM-DD&to=YYYY-MM-DD`

```json
{
  "schemaVersion": 1,
  "revision": "42",
  "generatedAt": "2026-09-15T18:00:00Z",
  "from": "2026-09-01",
  "to": "2026-09-15",
  "complete": true,
  "metrics": [
    {
      "key": "exercise:VARIANT_ID:max_load",
      "label": "Supino reto · halter · por halter",
      "unit": "kg",
      "observations": [
        {
          "externalKey": "workout:WORKOUT_ID:VARIANT_ID",
          "observedAt": "2026-09-10T18:00:00Z",
          "value": 20
        }
      ]
    }
  ]
}
```

- O usuário é identificado no servidor por configuração/autenticação; o cliente
  não deve conseguir escolher outro usuário arbitrariamente.
- IDs precisam ser estáveis após renomear exercícios; revisões devem refletir
  correções, remoções e inativações de séries.
- `complete` indica que toda a janela foi entregue. Somente respostas completas
  podem substituir essa janela em uma transação. Paginação exige juntar todas
  as páginas da mesma revisão antes de gravar.
- Incluir apenas séries de resultados aceitos e ativos. Nunca transmitir
  mensagens, remetentes, arquivos originais, propostas ou conteúdo de revisão.
- URL fixa e token ficam no ambiente do servidor, sem prefixo `NEXT_PUBLIC_`.

## Estrutura já disponível no Planner

`ProgressSource` identifica o provedor e permite vínculo opcional com uma atividade.
`ProgressMetric` define unidade, nome, cor e direção. `ProgressObservation` guarda
valor decimal, instante e chave externa única por métrica. O provedor
`GYM_TRACKER` está reservado; nenhum conector de academia está ativo.

O Planner atual é de uso pessoal e não possui autenticação. Antes de acesso
remoto compartilhado, ambos os sistemas precisam de autenticação e autorização.

## Próximos passos

1. Conferir o código atual do Gym Tracker e confirmar o usuário de origem.
2. Implementar e testar o endpoint sobre dados sintéticos.
3. Configurar acesso somente leitura entre os servidores.
4. Implementar sincronização e a aba Academia no Planner.
5. Validar correções, unidade de carga, duplicatas e indisponibilidade da origem.
