# Organização do Planner

Um aplicativo Next.js, um PostgreSQL pessoal e um PostgreSQL descartável de testes.
Não há novos serviços de frontend/backend separados.

```text
src/
  app/                       Rotas, páginas, layouts e Server Actions
  modules/
    activities/              Biblioteca e formulários de atividades
    planner/                 Dia, semana, mês, eventos, ocorrências e repetições
    tracking/                Indicadores da rotina e navegação do acompanhamento
    chess/                   API Chess.com, sincronização e gráficos de rating
  shared/
    components/              Navegação geral e mensagens de erro
    lib/                     Banco, datas, validação e utilitários compartilhados
  generated/prisma/          Cliente gerado; não editar
prisma/                      Schema, migrations e seed
scripts/
  local/                     Inicialização, controle e proteção do banco
  windows/                   Instalação dos atalhos
docs/                        Guias e decisões
.vscode/                     Tarefas manuais para trabalhar no VS Code
assets/shortcuts/             Ícones e suas fontes
Planner.code-workspace       Configuração portátil do editor
COMECE-AQUI.md                Ponto de entrada para uso e manutenção
```

Dentro de cada módulo, `components/` concentra a interface, `services/` o acesso
ao banco e os casos de uso, e `lib/` as regras puras. Chess também tem
`integrations/` para a API externa. Testes ficam junto do código que validam.

## Regras práticas

- URLs existentes continuam iguais; mover lógica não cria rotas novas.
- Código de uma funcionalidade fica no módulo correspondente. Só compartilhar
  o que realmente é usado por mais de uma área.
- Componentes de cliente não importam serviços de banco. Usam Server Actions.
- Serviços e integrações não devem depender de componentes visuais.
- Aliases usam `@/modules/...` e `@/shared/...`; não manter cópias nas pastas antigas.
- Validações usadas por vários módulos continuam compartilhadas nesta etapa.
- CSS permanece em `app/globals.css`; uma divisão visual pode ser feita depois,
  sem misturar alterações de aparência com esta reorganização estrutural.

## Operação local

`planner.mjs` coordena comandos e trava operações concorrentes. `server.mjs`
supervisiona somente o processo Next que iniciou e mantém um canal de controle
local autenticado por token aleatório. O comando de parar não procura/mata todos
os processos Node, não encerra Docker e não apaga volumes.

Estado e logs ficam em `.planner/`, ignorado pelo Git. O iniciador valida a saúde
da aplicação e a conexão ao banco antes de abrir o navegador. Uma porta ocupada
por outro programa gera erro, sem tentar encerrá-lo.

As versões de desenvolvimento e uso usam diretórios de compilação diferentes,
mas o mesmo código-fonte e banco pessoal. Alterações só entram na versão de uso
após novo preparo, acionado automaticamente ao abrir quando os arquivos mudaram.
`build-state.mjs` compara o conteúdo dos arquivos relevantes e valida o BUILD_ID,
sem recompilar por alterações nos dados pessoais. Não marca um preparo falho como
atualizado. O banco de testes nunca compartilha o volume pessoal.
