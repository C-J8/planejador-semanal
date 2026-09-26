# Planner

Planejamento pessoal por dia, semana e mês, com biblioteca de atividades,
indicadores de rotina e evolução no Chess.com.

**Primeiro acesso à pasta?** Leia [COMECE AQUI](COMECE-AQUI.md).
Para editar, abra `Planner.code-workspace` no VS Code e use **Terminal → Executar
Tarefa...**. O [manual de manutenção](docs/manutencao.md) mostra onde alterar cada
funcionalidade e como verificar suas mudanças sem depender de um assistente.

## Para abrir no dia a dia

Depois da instalação inicial, dê dois cliques em **Abrir Planner** na área de
trabalho ou no arquivo `Abrir Planner.cmd` desta pasta. Ele inicia o banco e a
aplicação e abre o navegador, sem precisar do VS Code.

| Atalho        | Função                                            |
| ------------- | ------------------------------------------------- |
| Abrir Planner | Atualiza automaticamente quando necessário e abre |
| Parar Planner | Encerra o aplicativo, preservando banco e dados   |

## Primeira instalação

Pré-requisitos: Node.js 20.9+ compatível com Next.js 16, npm e Docker Desktop.
Use `npm.cmd` no PowerShell se a política de execução bloquear `npm.ps1`.

```powershell
cd E:\trabalhos\ToDoList
npm.cmd ci
# Somente se .env ainda não existir:
Copy-Item .env.example .env
npm.cmd run shortcuts
npm.cmd run planner:open
```

Confira o `.env` antes do preparo. Não sobrescreva sua configuração existente.
O preparo faz backup antes das migrations; não insere dados de exemplo.
Se o Docker não iniciar automaticamente, abra o Docker Desktop e tente novamente.
O endereço padrão é [http://127.0.0.1:3000](http://127.0.0.1:3000).

## Guias

- [Comece aqui: usar e editar por conta própria](COMECE-AQUI.md)
- [Manual de manutenção e mapa dos arquivos](docs/manutencao.md)
- [Uso local, atalhos e solução de problemas](docs/uso-local.md)
- [Desenvolvimento e testes isolados](docs/desenvolvimento.md)
- [Backup e restauração sem sobrescrever o banco atual](docs/backup.md)
- [Organização dos módulos](docs/arquitetura.md)
- [Funcionalidades e integração Chess.com](docs/funcionalidades.md)
- [Proposta de integração com o Gym Tracker](docs/gym-tracker-integration.md)

## Estrutura

```text
src/
  app/                   Rotas, páginas e Server Actions
  modules/
    planner/             Agenda, ocorrências, eventos e repetições
    activities/          Biblioteca de atividades
    tracking/            Indicadores da rotina
    chess/               Integração e evolução no Chess.com
  shared/                Interface e utilitários compartilhados
prisma/                  Estrutura e migrations do banco
scripts/                 Inicialização, testes, backup e atalhos
docs/                    Guias de uso e manutenção
.vscode/                 Tarefas de uso, desenvolvimento e verificação
Planner.code-workspace   Abre o projeto no VS Code com menos ruído visual
```

Next.js 16, React 19, TypeScript, PostgreSQL 17, Prisma 7, Zod e Vitest.
O aplicativo roda na máquina; Docker hospeda os bancos. Não separe frontend e
backend para executar este projeto.

## Comandos principais

```powershell
npm.cmd run planner:open
npm.cmd run planner:stop
npm.cmd run planner:prepare
npm.cmd run planner:dev
npm.cmd run backup
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
```

Os testes de integração iniciam um banco **descartável e exclusivo na porta 5435**.
O banco pessoal padrão usa 5434. As configurações dos testes bloqueiam destinos
diferentes do banco dedicado.

A versão de uso fica em `.next-daily/`, e a de desenvolvimento em `.next/`.
Ambas usam o banco pessoal; apenas os testes usam o banco separado.
Ao abrir, o Planner verifica mudanças no código, migrations, dependências e
configurações. Se necessário, faz backup e prepara a nova versão automaticamente.
Sem mudanças, reutiliza a versão existente. Editar atividades não recompila o app.
Os comandos de desenvolvimento, preparo e backup continuam disponíveis no terminal,
sem atalhos extras. Não há download automático do GitHub ou instalação de pacotes.

## Segurança dos dados

- Não versione `.env`, logs ou backups.
- Não use `docker compose down -v` no banco pessoal.
- Guarde uma cópia dos backups fora do computador.
- Parar Planner encerra somente processos gerenciados pelo iniciador, não o Docker.
- A aplicação é pessoal e não tem autenticação; não a exponha à internet.
- As ações de exclusão no aplicativo não têm restauração automática.
- Nenhum atalho publica alterações no GitHub.
