# Planner

Aplicação web para planejar rotinas pessoais por dia, semana e mês. O Planner possui biblioteca reutilizável de atividades, agenda diária por horários, acompanhamento de execução, modelos semanais e repetições.

O Next.js roda diretamente na máquina. O Docker é usado somente para o PostgreSQL.

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

## Tecnologias

- Next.js 16 com App Router
- React 19
- TypeScript
- PostgreSQL
- Prisma 7
- Zod
- dnd-kit
- Vitest
- ESLint e Prettier
- Docker Compose

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Docker Desktop com Docker Compose
- Git

Verifique as instalações:

```powershell
node --version
npm.cmd --version
docker --version
docker compose version
git --version
```

No PowerShell, use `npm.cmd` caso a política de execução bloqueie `npm.ps1`.

## Instalação passo a passo

### 1. Clonar e entrar no repositório

```powershell
git clone https://github.com/C-J8/planejador-semanal.git
cd planejador-semanal
```

Se o projeto já estiver em `E:\trabalhos\ToDoList`:

```powershell
cd E:\trabalhos\ToDoList
```

### 2. Instalar dependências

```powershell
npm.cmd install
```

### 3. Configurar o ambiente

```powershell
Copy-Item .env.example .env
```

O valor padrão é compatível com o PostgreSQL do `compose.yaml`. Não envie `.env` para o GitHub.

### 4. Iniciar o PostgreSQL

```powershell
npm.cmd run db:up
```

Verifique os containers:

```powershell
docker compose ps
```

### 5. Gerar o cliente Prisma

```powershell
npm.cmd run db:generate
```

### 6. Aplicar as migrations

Em desenvolvimento:

```powershell
npm.cmd run db:migrate
```

Em produção:

```powershell
npm.cmd run db:deploy
```

### 7. Inserir dados iniciais, opcionalmente

```powershell
npm.cmd run db:seed
```

### 8. Iniciar o aplicativo

```powershell
npm.cmd run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Como usar

1. Cadastre atividades em `/atividades`.
2. Defina cor, horário e duração padrão quando necessário.
3. Abra `/semana` e arraste atividades para os dias.
4. Use `/dia` para acompanhar a agenda e registrar conclusão ou pulo.
5. Consulte `/mes` para visualizar a distribuição mensal.
6. Use `/acompanhamento` para comparar execução, tempo e volume.
7. Salve modelos ou configure repetições para rotinas recorrentes.

## Rotas

| Rota               | Finalidade                                |
| ------------------ | ----------------------------------------- |
| `/`                | Redirecionamento inicial                  |
| `/semana`          | Planejador semanal                        |
| `/dia`             | Agenda diária e execução                  |
| `/mes`             | Calendário mensal                         |
| `/atividades`      | Biblioteca de atividades                  |
| `/acompanhamento`  | Indicadores e gráficos                    |
| `/modelos`         | Modelos semanais                          |
| `/repeticoes`      | Repetições configuradas                   |
| `/semana/recursos` | Salvar/aplicar modelos e criar repetições |
| `/api/health`      | Verificação da aplicação e do banco       |

## Regras importantes

- A semana começa na segunda-feira.
- Datas de calendário são tratadas como valores locais, sem conversão acidental de dia.
- Instantes de conclusão usam o timezone `America/Sao_Paulo` na apresentação.
- Atividades arquivadas continuam visíveis em ocorrências antigas, mas não geram novos planejamentos.
- Concluir ou pular altera somente a ocorrência selecionada.
- Copiar semanas e aplicar modelos ignoram duplicatas.
- Eventos não entram nos indicadores de atividades.
- A limpeza semanal não remove eventos, modelos, repetições ou atividades da biblioteca.

## Banco de dados

Principais entidades:

- `Activity`
- `ActivityOccurrence`
- `CalendarEvent`
- `WeeklyTemplate`
- `WeeklyTemplateItem`
- `ActivityRecurrence`

Comandos úteis:

```powershell
npm.cmd run db:up
npm.cmd run db:down
npm.cmd run db:logs
npm.cmd run db:status
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:deploy
npm.cmd run db:seed
```

## Testes e qualidade

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run build
```

Executar toda a suíte:

```powershell
npm.cmd test
```

Os testes de integração usam PostgreSQL. Para não misturar testes com dados pessoais, prefira uma instância ou banco dedicado para testes.

## Produção

```powershell
npm.cmd run db:deploy
npm.cmd run build
npm.cmd run start
```

## Estrutura

```text
prisma/
  migrations/       Histórico do banco
  schema.prisma     Modelo de dados
  seed.ts           Dados iniciais
src/
  app/              Rotas, páginas e Server Actions
  components/       Interface e interações
  lib/              Validação e regras puras
  services/         Acesso ao banco e serviços de domínio
```

## Solução de problemas

### `npm.ps1 não pode ser carregado`

Use o executável do npm:

```powershell
npm.cmd run dev
```

### `Could not read package.json`

O terminal está fora da pasta do projeto:

```powershell
cd E:\trabalhos\ToDoList
npm.cmd run dev
```

### `ERR_CONNECTION_REFUSED`

O servidor Next.js não está em execução. Inicie com:

```powershell
npm.cmd run dev
```

### Banco indisponível

```powershell
npm.cmd run db:up
docker compose ps
npm.cmd run db:logs
```

## Segurança

- Não versione `.env` ou credenciais.
- Revise migrations antes de aplicá-las em produção.
- Faça backup do PostgreSQL antes de alterações estruturais.
- A ação **Limpar semana** remove ocorrências e não possui restauração automática.
