# Comece aqui

Você não precisa do Codex para usar ou modificar o Planner. Este projeto roda
no seu computador, com Node.js e Docker Desktop instalados.

## Quero apenas usar

1. Abra **Abrir Planner.cmd**, nesta pasta ou pelo atalho da área de trabalho.
2. Use o Planner no navegador. O endereço padrão é `http://127.0.0.1:3000`.
3. Quando terminar, use **Parar Planner.cmd**. Fechar a aba não para o servidor.

Abrir Planner prepara automaticamente uma nova versão se você alterou o código.
Não baixa alterações do GitHub. Parar Planner não apaga dados nem desliga o Docker.

## Quero editar

1. No VS Code, use **Arquivo → Abrir Workspace do Arquivo...** e escolha
   **Planner.code-workspace**, nesta pasta.
2. Abra **Terminal → Executar Tarefa...** e escolha **Planner: parar**.
3. Execute a tarefa **Planner: desenvolver**.
4. Edite um arquivo e salve com `Ctrl+S`. Confira a mudança no navegador.
5. Execute **Planner: verificar código**. Para mudanças de banco, execute também
   **Planner: testar integração (banco isolado)**.
6. Execute **Planner: parar**, depois **Planner: abrir** para voltar ao uso normal.

As tarefas apenas chamam comandos do projeto. Nenhuma exige extensão paga, conta
de IA ou créditos. Nada é executado automaticamente ao abrir o workspace.
O servidor continua ativo depois de a tarefa de desenvolver terminar; use Parar.

**Atenção:** desenvolvimento usa seus dados reais. Antes de experiências que
alterem dados, execute **Planner: backup dos dados**. Somente os testes de
integração usam um banco separado e descartável.

## Onde mexer primeiro?

| Quero mudar…                 | Começo por…                                              |
| ---------------------------- | -------------------------------------------------------- |
| Cores, fontes e espaçamentos | `src/app/globals.css`                                    |
| Tela semanal                 | `src/modules/planner/components/weekly-planner.tsx`      |
| Tela diária                  | `src/modules/planner/components/daily-planner.tsx`       |
| Tela mensal                  | `src/app/mes/page.tsx`                                   |
| Formulário de atividades     | `src/modules/activities/components/activity-form.tsx`    |
| Indicadores da rotina        | `src/modules/tracking/components/tracking-dashboard.tsx` |
| Tela de xadrez               | `src/app/acompanhamento/xadrez/page.tsx`                 |
| Botão de atualizar o Chess   | `src/modules/chess/components/chess-sync-form.tsx`       |

Leia o [manual de manutenção](docs/manutencao.md) para entender o restante,
fazer uma alteração com segurança e resolver os erros mais comuns.

## Não apague para “limpar”

- `.env`: configuração local. Não publique suas credenciais.
- `backups/`: cópias dos dados. Guarde também uma cópia fora deste computador.
- `prisma/migrations/`: histórico necessário para atualizar o banco.
- `.git/`: histórico do código. Não contém o backup do banco.
- O volume do PostgreSQL no Docker: é onde ficam os dados pessoais.

No workspace, pastas geradas e operacionais ficam ocultas para facilitar a
navegação. **Ocultar não é excluir.** Você continua acessando todas pelo
Explorador de Arquivos do Windows. Os detalhes estão no manual.

Para instalar em outro computador, siga a [primeira instalação no README](README.md#primeira-instalação)
e leve também seu backup e sua configuração local com segurança.
