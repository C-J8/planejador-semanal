# Planejador Semanal

Aplicação web para planejar e acompanhar atividades pessoais. O projeto permite
criar uma biblioteca de atividades, organizá-las por dia e semana, registrar a
execução, visualizar o mês, copiar planejamentos, salvar modelos e materializar
repetições finitas.

A aplicação Next.js roda diretamente na máquina. Somente o PostgreSQL é
executado em container Docker.

## Sumário

- [Funcionalidades](#funcionalidades)
- [Tecnologias](#tecnologias)
- [Arquitetura e domínio](#arquitetura-e-domínio)
- [Pré-requisitos](#pré-requisitos)
- [Instalação passo a passo](#instalação-passo-a-passo)
- [Como usar](#como-usar)
- [Rotas](#rotas)
- [Banco de dados](#banco-de-dados)
- [Datas e timezone](#datas-e-timezone)
- [Testes e qualidade](#testes-e-qualidade)
- [Build de produção](#build-de-produção)
- [Solução de problemas](#solução-de-problemas)
- [Segurança e integridade](#segurança-e-integridade)
- [Limitações atuais](#limitações-atuais)
- [Publicação no GitHub](#publicação-no-github)

## Funcionalidades

### Biblioteca de atividades

- Criação e edição de atividades reutilizáveis.
- Nome, cor, ícone, descrição, horário e duração padrão opcionais.
- Pesquisa por nome ou descrição.
- Filtros de atividades ativas, arquivadas ou todas.
- Arquivamento reversível sem apagar o histórico.
- Atividades arquivadas não podem gerar novos planejamentos.

### Planejamento semanal

- Semana de segunda-feira a domingo.
- Biblioteca lateral somente com atividades ativas.
- Adição acessível por seletor e por drag and drop.
- Movimentação entre dias e reordenação dentro do mesmo dia.
- Edição de data, horário, duração e observações.
- Exclusão individual de ocorrências.
- Eventos exibidos separadamente das atividades.

### Execução diária

- Estados `PLANNED`, `COMPLETED` e `SKIPPED`.
- Ações para concluir, pular e reabrir uma ocorrência.
- Registro de `completedAt` apenas na primeira conclusão.
- Ações repetidas idempotentes.
- Atividades arquivadas continuam visíveis e executáveis no histórico.

### Visão mensal

- Grade completa do mês, começando na segunda-feira.
- Dias adjacentes necessários para completar as semanas.
- Ocorrências e eventos em grupos separados.
- Atalhos para a Tela Dia e a semana correspondente.

### Acompanhamento

- Período padrão do primeiro dia do mês atual até hoje.
- Intervalo máximo de 366 dias, contando as datas inicial e final.
- Filtros por período, atividade e status mantidos na URL.
- Contagem de planejadas, concluídas, puladas e total.
- Taxa de conclusão: `concluídas / total × 100`.
- Minutos planejados por atividade.
- Frequências semanal e mensal com períodos vazios representados por zero.
- Histórico paginado com 25 ocorrências por página.
- Eventos e ocorrências futuras são sempre excluídos.
- Tela estritamente de leitura.

### Recursos semanais

- Cópia segura entre semanas.
- Pré-visualização e confirmação explícita antes de operações em lote.
- Modelos semanais persistentes.
- Aplicação idempotente de modelos.
- Repetições semanais finitas, com intervalo configurável.
- Cancelamento restrito de repetição.
- Materialização imediata de todas as ocorrências no PostgreSQL.

## Tecnologias

- Next.js 16 com App Router
- React 19
- TypeScript
- PostgreSQL 17 Alpine
- Prisma ORM 7
- Zod
- dnd-kit
- Tailwind CSS/PostCSS e CSS global
- Vitest
- ESLint
- Prettier
- Docker Compose

## Arquitetura e domínio

O domínio separa três conceitos principais:

```text
Activity
  definição reutilizável de uma atividade

ActivityOccurrence
  agendamento persistido e executável em uma data

CalendarEvent
  compromisso pontual independente
```

Uma atividade não é uma ocorrência. Alterar o horário ou a duração padrão de
uma atividade não modifica ocorrências que já existem. Cada ocorrência mantém
seu próprio snapshot de horário e duração, inclusive `null`.

Eventos não possuem relação com atividades e nunca participam de:

- acompanhamento;
- cópia de semana;
- modelos semanais;
- repetições;
- cancelamento de repetição.

O fluxo principal da aplicação é:

```text
Server Component
  → serviço de domínio
  → Prisma/PostgreSQL
  → DTO serializável
  → componente de apresentação

Server Action
  → validação Zod
  → serviço de domínio
  → transação quando necessária
  → revalidação das rotas afetadas
  → resposta ou redirecionamento seguro
```

## Pré-requisitos

Instale antes de começar:

- Node.js LTS;
- npm;
- Docker Desktop com Docker Compose;
- Git, caso pretenda versionar o projeto.

Confirme as ferramentas:

```powershell
node --version
npm --version
docker --version
docker compose version
git --version
```

## Instalação passo a passo

### 1. Entre na pasta do projeto

```powershell
cd E:\trabalhos\ToDoList
```

Em Linux ou macOS, use o caminho onde o projeto foi clonado.

### 2. Instale as dependências

```powershell
npm install
```

### 3. Crie o arquivo de ambiente local

No PowerShell:

```powershell
Copy-Item .env.example .env
```

Em Linux ou macOS:

```bash
cp .env.example .env
```

Configuração padrão:

```dotenv
POSTGRES_USER=planejador
POSTGRES_PASSWORD=planejador_dev
POSTGRES_DB=planejador
POSTGRES_PORT=5434
DATABASE_URL=postgresql://planejador:planejador_dev@localhost:5434/planejador?schema=public
APP_TIMEZONE=America/Sao_Paulo
```

O `.env` é ignorado pelo Git. Não publique credenciais reais.

Se a porta `5434` estiver ocupada, escolha outra porta e altere tanto
`POSTGRES_PORT` quanto a porta dentro de `DATABASE_URL`.

### 4. Inicie o PostgreSQL

```powershell
npm run db:up
```

Confira o estado:

```powershell
docker compose ps
```

O serviço `db` deve aparecer como `healthy`.

### 5. Gere o Prisma Client

```powershell
npm run db:generate
```

### 6. Aplique as migrations

Para uma instalação nova ou ambiente de entrega:

```powershell
npm run db:deploy
```

Confira o estado:

```powershell
npm run db:status
```

O Prisma deve informar que o schema está atualizado.

### 7. Carregue os dados iniciais

```powershell
npm run db:seed
```

O seed cria somente:

- Academia;
- Leitura;
- Sono.

Ele usa `upsert`, pode ser executado novamente e não cria ocorrências, eventos,
modelos ou repetições.

### 8. Inicie a aplicação

```powershell
npm run dev
```

Abra <http://localhost:3000>. A raiz redireciona para `/semana`.

### 9. Verifique a conexão

Abra <http://localhost:3000/api/health>.

Resposta esperada:

```json
{
  "status": "ok",
  "database": "connected",
  "timezone": "America/Sao_Paulo"
}
```

O retorno também contém um timestamp.

## Como usar

### 1. Crie uma atividade

1. Abra `/atividades`.
2. Selecione **Nova atividade**.
3. Informe um nome e uma cor.
4. Opcionalmente, informe ícone, horário, duração e descrição.
5. Salve.

Uma atividade sem duração padrão gera ocorrências com duração ausente, a menos
que uma duração seja informada posteriormente.

### 2. Planeje uma semana

1. Abra `/semana`.
2. Arraste uma atividade da biblioteca para um dia; ou
3. use o seletor **Adicionar atividade** no rodapé do dia.
4. Arraste ocorrências para mudar sua ordem ou data.
5. Use **Editar** para mudar data, horário, duração ou observações.

### 3. Registre um evento

1. Escolha **Adicionar evento** no dia desejado.
2. Informe título, data e os campos opcionais.
3. Salve.

Eventos podem ser editados, reagendados, cancelados ou excluídos
individualmente. Cancelar mantém o evento visível; excluir remove apenas aquele
registro.

### 4. Execute o planejamento diário

1. Abra `/dia` ou selecione **Ver dia** na semana.
2. Use **Concluir** ou **Pular** em uma ocorrência planejada.
3. Use **Reabrir** antes de escolher outro resultado.

Concluir grava o instante real em `completedAt`. Pular e reabrir mantêm esse
campo nulo.

### 5. Consulte o mês

Abra `/mes` ou informe diretamente:

```text
/mes?month=2026-08
```

Selecione o número do dia para abrir a Tela Dia ou **Ver semana** para abrir o
planejador semanal correspondente.

### 6. Consulte o acompanhamento

Abra `/acompanhamento`. Os filtros usam:

```text
from=YYYY-MM-DD
to=YYYY-MM-DD
activity=all|UUID
status=ALL|PLANNED|COMPLETED|SKIPPED
page=N
```

Datas futuras são limitadas a hoje em `America/Sao_Paulo`.

### 7. Copie uma semana

1. Em `/semana`, abra **Copiar semana**.
2. Escolha as segundas-feiras de origem e destino.
3. Confira a pré-visualização.
4. Confirme somente se houver itens criáveis.

A assinatura de duplicidade é:

```text
activityId + scheduledDate + startTime + durationMinutes
```

`null` é comparado explicitamente. A multiplicidade é preservada:

```text
quantidade a criar = max(0, quantidade desejada - quantidade existente)
```

Se a origem possui duas ocorrências idênticas e o destino uma, somente uma será
criada. Executar novamente não cria novas duplicatas. Status, conclusão, IDs e
eventos nunca são copiados.

### 8. Salve e aplique um modelo

1. Organize uma semana.
2. Abra **Salvar como modelo**.
3. Informe nome e descrição opcional.
4. Confira os itens elegíveis e salve.
5. Abra `/modelos` para aplicar, renomear ou excluir o modelo.

O modelo guarda atividade, weekday, horário, posição e snapshot da duração. Não
guarda data absoluta, status ou conclusão. Excluir um modelo não remove
ocorrências criadas anteriormente.

Atividades arquivadas permanecem visíveis como indisponíveis e voltam a ser
elegíveis quando reativadas.

### 9. Crie uma repetição finita

1. Abra **Criar repetição** nas ações semanais.
2. Selecione uma atividade ativa.
3. Informe data inicial e data final inclusiva.
4. Marque um ou mais dias da semana.
5. Informe o intervalo em semanas.
6. Opcionalmente, informe horário e duração.
7. Confira todas as datas da prévia.
8. Confirme a materialização.

Limites:

- data inicial igual ou posterior a hoje;
- data final obrigatória;
- período máximo de 366 dias;
- intervalo entre 1 e 52 semanas;
- até 500 datas candidatas;
- duração positiva e até 10080 minutos, quando informada.

Não existe cron ou recorrência infinita. Todas as ocorrências são persistidas no
momento da confirmação.

### 10. Cancele uma repetição

1. Abra `/repeticoes`.
2. Escolha a data de efeito.
3. Confira a prévia.
4. Confirme o cancelamento.

São removidas somente ocorrências:

- vinculadas à regra confirmada;
- com status `PLANNED`;
- na data de efeito ou depois dela.

Concluídas, puladas, anteriores, independentes e desvinculadas são preservadas.
Editar manualmente a data, o horário ou a duração desvincula a ocorrência da
regra. Alterar somente o status ou reordenar no mesmo dia mantém o vínculo.

## Rotas

| Rota               | Finalidade                                 |
| ------------------ | ------------------------------------------ |
| `/`                | Redireciona para `/semana`                 |
| `/semana`          | Planejador semanal                         |
| `/dia`             | Execução diária                            |
| `/mes`             | Visão mensal                               |
| `/atividades`      | Biblioteca de atividades                   |
| `/atividades/nova` | Cadastro de atividade                      |
| `/acompanhamento`  | Indicadores e histórico                    |
| `/semana/recursos` | Cópia, modelos e repetição                 |
| `/modelos`         | Gerenciamento de modelos                   |
| `/repeticoes`      | Gerenciamento e cancelamento de repetições |
| `/api/health`      | Saúde da aplicação e do banco              |

As telas de edição de ocorrências e eventos são acessadas pelos links das telas
principais.

## Banco de dados

### Modelos Prisma

- `Activity`
- `ActivityOccurrence`
- `CalendarEvent`
- `WeeklyTemplate`
- `WeeklyTemplateItem`
- `ActivityRecurrence`

### Relações importantes

- Uma atividade possui várias ocorrências.
- Uma atividade pode ser referenciada por modelos e repetições.
- Atividades referenciadas usam `ON DELETE RESTRICT`.
- Excluir um modelo remove seus itens por cascata, mas não remove atividades ou
  ocorrências.
- Excluir uma regra de repetição não é parte do fluxo normal; cancelamentos são
  preservados para consulta.
- Ocorrências possuem `recurrenceId` opcional.

### Comandos do banco

```powershell
npm run db:up        # inicia o PostgreSQL
npm run db:down      # para o container sem apagar o volume
npm run db:logs      # acompanha os logs
npm run db:generate  # gera o Prisma Client
npm run db:migrate   # cria/aplica migration em desenvolvimento
npm run db:deploy    # aplica migrations existentes
npm run db:status    # confere migrations
npm run db:seed      # executa o seed idempotente
```

Não use `prisma migrate reset`, `prisma db push` ou `docker compose down -v` em
um banco que precise ser preservado.

Para acessar o PostgreSQL:

```powershell
docker compose exec db psql -U planejador -d planejador
```

Consultas úteis:

```sql
SHOW TIME ZONE;
\dt
SELECT * FROM activities ORDER BY name;
```

## Datas e timezone

O timezone do domínio é `America/Sao_Paulo`.

- Datas de calendário usam PostgreSQL `date`.
- Horários usam `time without time zone`.
- Instantes de auditoria usam `timestamptz`.
- Datas são transportadas como `YYYY-MM-DD`.
- Horários são transportados como `HH:mm`.
- Aritmética de calendário usa funções centralizadas e UTC apenas como
  representação neutra, sem mudar o dia local.
- Hoje é sempre calculado explicitamente em São Paulo.

## Testes e qualidade

O PostgreSQL precisa estar ativo para os testes de integração.

```powershell
npm run test:unit
npm run test:integration
npm test
npm run format:check
npm run lint
npm run typecheck
npm run build
```

O `typecheck` executa `next typegen` antes do TypeScript, portanto funciona em
um clone limpo sem depender de uma build anterior. A pasta `.next` continua
sendo apenas um artefato gerado e não deve ser versionada.

A suíte de integração usa identificadores exclusivos e remove somente seus
próprios dados. Ela não usa mocks como substituto do PostgreSQL.

Cobertura relevante:

- validação e aritmética de datas;
- transições de status e `completedAt`;
- atividade arquivada e histórico;
- duração opcional;
- separação de eventos;
- cópia e multiplicidade;
- modelos e idempotência;
- repetição quinzenal e datas parciais;
- cancelamento restrito;
- desvinculação individual;
- acompanhamento sem eventos ou futuro;
- quantidade constante de queries nas operações críticas.

## Build de produção

Crie a build:

```powershell
npm run build
```

Inicie em produção:

```powershell
npm run start
```

Para usar outra porta:

```powershell
npm run start -- -p 3010
```

## Solução de problemas

### PostgreSQL não inicia

```powershell
docker compose ps
docker compose logs db
```

Confirme se a porta configurada está livre e se Docker Desktop está ativo.

### Prisma não conecta

Confira se `DATABASE_URL` usa o mesmo usuário, senha, banco e porta definidos no
Compose. Depois execute:

```powershell
npm run db:status
```

### Prisma Client desatualizado

```powershell
npm run db:generate
```

Reinicie o servidor Next.js depois da geração.

### Porta 3000 ocupada

Não encerre processos desconhecidos. Use outra porta:

```powershell
npm run dev -- -p 3010
```

### Testes de integração falham

Confirme que o banco está saudável e as migrations aplicadas:

```powershell
npm run db:up
npm run db:status
npm run test:integration
```

## Segurança e integridade

- Toda Server Action valida novamente dados recebidos.
- Operações em lote recalculam a prévia no servidor.
- Erros de banco não são enviados diretamente para a interface.
- Operações críticas usam transações serializáveis.
- Conflitos transitórios possuem tentativas limitadas.
- Exclusões usam identificadores e filtros estritos.
- Atividades referenciadas não são apagadas em cascata.
- `.env`, build, dependências e Prisma Client gerado são ignorados pelo Git.

O projeto não possui autenticação. Ele foi projetado para uso local por uma
única pessoa.

## Limitações atuais

Não estão implementados:

- usuários, autenticação ou permissões;
- sincronização ou compartilhamento;
- notificações e lembretes;
- metas, streaks ou gamificação;
- exportação CSV ou PDF;
- recorrência mensal ou anual;
- recorrência infinita;
- cron, workers ou filas;
- deploy automatizado.

## Publicação no GitHub

Para publicar manualmente um clone ainda sem Git:

```powershell
git init
git add .
git commit -m "Entrega inicial do Planejador Semanal"
git branch -M main
git remote add origin git@github.com:SEU_USUARIO/planejador-semanal.git
git push -u origin main
```

Antes do commit, confirme que `.env`, `node_modules`, `.next` e o Prisma Client
gerado não aparecem em `git status`.

## Licença

Nenhuma licença de código aberto foi definida. Adicione uma licença antes de
permitir redistribuição ou contribuição pública.
