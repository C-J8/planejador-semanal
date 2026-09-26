# Manutenção por conta própria

Comece pelo [guia rápido](../COMECE-AQUI.md). Este manual serve para trabalhar no
projeto com o VS Code e o terminal, sem depender de um assistente.

## Mapa da pasta

| Pasta/arquivo                                               | Responsabilidade                                   | Editar?                                              |
| ----------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| `src/app/`                                                  | Páginas, rotas, ações dos formulários e CSS global | Sim                                                  |
| `src/modules/`                                              | Código separado por funcionalidade                 | Sim                                                  |
| `src/shared/`                                               | Componentes e funções usados por várias áreas      | Sim                                                  |
| `prisma/schema.prisma`                                      | Estrutura dos dados                                | Com backup e migration                               |
| `prisma/migrations/`                                        | Mudanças versionadas da estrutura do banco         | Adicionar; não apagar/regravar as já aplicadas       |
| `public/`                                                   | Arquivos públicos servidos pelo aplicativo         | Sim                                                  |
| `assets/shortcuts/`                                         | Fontes e imagens dos ícones dos atalhos            | Se mudar os ícones                                   |
| `scripts/`                                                  | Inicialização, backup, testes e atalhos            | Se mudar a operação local                            |
| `docs/`                                                     | Instruções de uso e manutenção                     | Sim, junto das mudanças                              |
| `.vscode/tasks.json`                                        | Comandos do menu Executar Tarefa                   | Se precisar de novas tarefas                         |
| `package.json` e `package-lock.json`                        | Comandos e versões das dependências                | Manter ambos; não editar o lock manualmente          |
| `compose.yaml`                                              | PostgreSQL pessoal                                 | Com cuidado: preserva o volume existente             |
| `compose.test.yaml`                                         | PostgreSQL descartável de testes                   | Nunca apontar para o banco pessoal                   |
| `.env`                                                      | Configuração privada desta máquina                 | Só quando necessário; nunca publicar                 |
| `backups/`                                                  | Cópias do banco em arquivos `.dump`                | Guardar cópias externas                              |
| `node_modules/`, `.next/`, `.next-daily/`, `src/generated/` | Dependências e código gerado                       | Não editar manualmente                               |
| `.planner/`                                                 | Logs, estado e controle dos processos locais       | Consultar logs; não publicar                         |
| Arquivos de configuração na raiz                            | Next.js, TypeScript, Prisma, testes e formatação   | Manter na raiz; ferramentas dependem desses caminhos |

`AGENTS.md` orienta assistentes de programação. Não executa o Planner e não
substitui este manual. Não há necessidade de mexer nele para usar o projeto.

### Como encontrar uma funcionalidade

Os módulos são `activities` (biblioteca), `planner` (agenda), `tracking`
(indicadores) e `chess` (xadrez). Dentro deles:

- `components/`: o que aparece na tela e suas interações.
- `lib/`: cálculos, formatação e regras que podem ser testadas sem banco.
- `services/`: leitura/escrita no banco e operações completas.
- `integrations/`: comunicação com serviços externos; atualmente Chess.com.
- `*.unit.test.*` e `*.integration.test.*`: testes, junto do código relacionado.

Uma página em `src/app/` monta a tela com os componentes. A ação do formulário
em `actions.ts` valida/processa o pedido usando um serviço. Não importe o Prisma
em componentes que executam no navegador (`"use client"`).

No VS Code, `Ctrl+P` encontra arquivos pelo nome e `Ctrl+Shift+F` procura um texto
no projeto. Para descobrir onde uma frase da interface é definida, procure por ela.

## Exemplo de alteração simples

1. Execute `npm.cmd run planner:stop` e depois `npm.cmd run planner:dev`.
2. Para ajustar a aparência, abra `src/app/globals.css`, localize a classe da
   região desejada e mude uma propriedade por vez. Não faça substituições globais
   sem conferir todos os usos.
3. Salve e confira a tela no navegador, inclusive em janela mais estreita.
4. Execute a tarefa **Planner: verificar código** ou os três comandos abaixo.
5. Pare o modo de desenvolvimento e abra o Planner normal. O preparo é automático.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:unit
```

`typecheck` encontra inconsistências de tipos; `lint` encontra problemas de
qualidade do código; `test:unit` confere regras e cálculos. Eles não substituem
a conferência visual. Para banco/serviços, execute também:

```powershell
npm.cmd run test:integration
```

O teste de integração inicia o banco dedicado na porta 5435. Ele não deve alterar
seus dados da porta 5434. [Detalhes dos testes](desenvolvimento.md).

### Terminal ou tarefas?

São duas maneiras de executar a mesma coisa. Abra o terminal na pasta do projeto.
No Windows usamos `npm.cmd`, evitando bloqueios de execução do `npm.ps1`.
As tarefas do VS Code usam a pasta atual do workspace, sem um caminho fixo.

Parar uma tarefa já finalizada ou fechar o VS Code **não encerra** o servidor
gerenciado. Use **Planner: parar** ou `npm.cmd run planner:stop`.
Trocar entre desenvolver e usar também exige parar o modo anterior.

## Banco e dependências exigem mais cuidado

Faça `npm.cmd run backup` antes de alterações estruturais. Copie o `.dump` para
um lugar externo seguro. O backup do banco não inclui código nem `.env`.

Mudar `schema.prisma` não basta: é necessário criar e revisar uma migration,
validá-la no banco isolado e então aplicá-la. Não experimente resets no banco
pessoal. Não use `prisma migrate reset`, `prisma db push --force-reset` ou
`docker compose down -v` para corrigir erros de inicialização.

`db:seed` insere dados de exemplo; não é necessário para o uso diário.
O comando Abrir aplica migrations existentes e nunca executa esse seed.

Use `npm.cmd ci` na instalação ou para sincronizar as dependências com o
`package-lock.json` após uma mudança delas. Não é necessário executar todo dia.
Não atualize todas as bibliotecas apenas para resolver um erro visual.

## Preservar o trabalho com Git

Git protege o **código**, não o banco. Confira primeiro:

```powershell
git status
git diff
```

Depois dos testes, selecione no painel **Controle do Código-Fonte** do VS Code
somente os arquivos da sua alteração, confira o diff e crie um commit com uma
mensagem clara. Revise especialmente arquivos novos. Não envie `.env`, `.dump`,
logs ou dados pessoais. Enviar ao GitHub é uma etapa separada e intencional.

Não use “descartar todas as alterações” para limpar a pasta: isso pode perder
trabalho que ainda não virou commit. Para recuperar dados, siga o
[guia de backup](backup.md), que restaura em outro banco sem sobrescrever o atual.

## Se der problema

| Sintoma                          | Primeiro passo seguro                                                     |
| -------------------------------- | ------------------------------------------------------------------------- |
| Navegador não conecta            | Executar Planner: abrir e ler a mensagem do terminal                      |
| Outro modo está ativo            | Planner: parar, depois abrir ou desenvolver                               |
| Docker/banco indisponível        | Abrir Docker Desktop, esperar iniciar e tentar novamente                  |
| Porta ocupada                    | Conferir quem abriu o servidor; não encerrar todos os processos Node      |
| Edição não aparece no uso normal | Abrir Planner novamente e esperar o preparo terminar                      |
| Falha de compilação              | Corrigir o primeiro erro indicado; executar typecheck e lint              |
| Chess acabou de sincronizar      | Esperar os cinco minutos entre atualizações; observar a mensagem do botão |
| Erro ao iniciar sem explicação   | Consultar `.planner/daily.log` ou `.planner/dev.log`                      |

Não publique logs ou `.env` sem revisar e remover informações privadas.
[Mais solução de problemas](uso-local.md#se-algo-falhar).

## Por que algumas pastas não aparecem no VS Code?

`Planner.code-workspace` oculta pastas geradas e o estado de execução para você
enxergar principalmente o código. Os arquivos continuam no disco. `backups/`
continua visível, mas fica fora da busca, assim como configurações privadas.

Para consultar logs, abra `.planner/daily.log` por **Arquivo → Abrir Arquivo...**
ou no Explorador de Arquivos. Para mostrar tudo no editor, ajuste `files.exclude`
no arquivo `Planner.code-workspace` (troque a entrada desejada para `false`).
Nenhuma dessas opções apaga arquivos, desliga a aplicação ou muda o banco.
