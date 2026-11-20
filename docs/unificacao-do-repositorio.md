# Planner e Academia no mesmo repositório

O repositório `planejador-semanal` reúne o Planner, o acompanhamento de xadrez
e o Gym Tracker. O histórico Git dos dois projetos foi preservado; os commits
originais continuam acessíveis sem reescrita. A Academia também inclui as
melhorias locais de importação, peso corporal e últimos treinos.

## Organização

```text
src/                         Planner, rotina, xadrez e status dos serviços
prisma/                      Banco e migrations do Planner
scripts/                     Inicialização conjunta, atalhos e backups
compose.yaml                 Servidor PostgreSQL compartilhado
apps/gym-tracker/
  app.py                     Dashboard da Academia
  src/gym_tracker/            Importação, revisão, supervisão e métricas
  migrations/                Migrations exclusivas da Academia
  tests/                     Testes Python
.github/workflows/ci.yml      Verificação das duas aplicações
```

Cada aplicação mantém suas dependências e migrations: npm/Prisma para o
Planner, uv/Alembic para a Academia. Os bancos `planejador` e `gym_tracker`
continuam separados no mesmo PostgreSQL. A união do código não transfere
treinos, mensagens, atividades nem credenciais entre bancos.

## Novo checkout

Na raiz do projeto:

```powershell
git clone https://github.com/C-J8/planejador-semanal.git
cd planejador-semanal
npm.cmd ci
npm.cmd run gym:install
Copy-Item .env.example .env
Copy-Item apps/gym-tracker/.env.example apps/gym-tracker/.env
```

Copie os exemplos apenas se os arquivos `.env` ainda não existirem. Configure
o acesso de cada aplicativo ao seu banco. No `.env` da raiz,
`GYM_TRACKER_PATH=apps/gym-tracker` habilita a Academia; vazio mantém somente o
Planner. Python 3.12, uv, Node compatível e Docker Desktop são necessários
para executar as duas aplicações.

Criar o contêiner não cria o banco nem o usuário da Academia. Para uma
instalação nova, siga o [guia do PostgreSQL compartilhado](../apps/gym-tracker/docs/shared-postgres.md)
e o [README da Academia](../apps/gym-tracker/README.md). Para dados existentes,
restaure os backups antes de aplicar migrations. Os atalhos **Abrir Planner**
e **Parar Planner** continuam controlando os dois serviços.

## Instalação local já existente

As pastas `E:\trabalhos\ToDoList` e `E:\trabalhos\Acad` continuam funcionando
com suas configurações atuais. A união no GitHub não move nem apaga essas
pastas. Não inicie duas cópias do importador sobre o mesmo banco.

Para adotar um checkout unificado no computador, pare os aplicativos, faça
backup e configure nele os `.env` existentes. Ajuste `GYM_TRACKER_PATH`,
`GYM_IMPORT_FILE`, o diretório de backups e qualquer caminho absoluto para os
locais efetivamente usados. Os arquivos de WhatsApp e os backups permanecem
privados. Recrie os ambientes e os atalhos nesse checkout; não copie caches
ou ambientes virtuais da instalação anterior.

O nome Compose `projeto-planejador` e seu volume permanecem estáveis. Renomear
o repositório ou a pasta não deve criar outro volume nem outra cópia vazia do
banco. Nunca use `docker compose down -v` para essa mudança.

## Verificações

Na raiz:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run gym:lint
npm.cmd run gym:format:check
npm.cmd run gym:test
```

O CI executa as duas suítes, incluindo PostgreSQL descartável. O teste de
abertura e parada conjunta está disponível em `npm.cmd run gym:test:planner`;
ele exige que o Planner pessoal esteja parado e usa dados sintéticos.

O repositório original `gym-tracker` foi mantido como referência histórica.
Novas alterações das duas aplicações devem ser feitas neste repositório.
