# Abrir e usar o Planner no Windows

## Primeira instalação

Instale Node.js compatível com o projeto e Docker Desktop. No terminal do VS Code:

```powershell
cd E:\trabalhos\ToDoList
npm.cmd ci
```

Somente se ainda não existir `.env`, copie `.env.example` para `.env`. Não substitua
um arquivo existente: ele contém a configuração do seu banco.

```powershell
Copy-Item .env.example .env
npm.cmd run shortcuts
```

Ao abrir pela primeira vez, o preparo cria um backup, gera o cliente Prisma, aplica migrations pendentes e
compila a versão de uso. Não insere atividades de exemplo. Os atalhos ficam na
área de trabalho; se mudar a pasta do projeto, atualize/remova os atalhos antigos
antes de instalar novamente. O instalador se recusa a substituir outro destino.

## No dia a dia

- **Abrir Planner:** verifica/inicia o Docker e o banco, confere se o código mudou,
  prepara a versão quando necessário e abre `/semana` no navegador. Sem mudanças,
  uma segunda abertura reutiliza o mesmo servidor. Não é necessário abrir o VS Code
  ou manter um terminal aberto.
- **Parar Planner:** encerra somente o servidor iniciado pelos nossos atalhos.
  O PostgreSQL e o Docker ficam ligados; nenhum dado é apagado.

Os mesmos arquivos `.cmd` estão na raiz do repositório, caso não queira atalhos.
Na primeira abertura sem compilação pronta, o preparo é executado automaticamente.
Nas seguintes, o preparo só ocorre se houver mudanças relevantes. Ele cria backup
antes de migrations e compilação, sem baixar código do GitHub nem instalar pacotes.
Se mudar as dependências, execute `npm.cmd ci` conforme as orientações de manutenção.
Alterações em atividades, documentação, testes, logs e backups não recompilam o app.
Se o código mudar enquanto estiver aberto, clique em **Abrir Planner** novamente:
o servidor será reiniciado com a nova versão. Finalize edições de formulários antes.

Existem apenas dois atalhos, com ícones próprios. Os três atalhos antigos deste
projeto são movidos para `.planner/retired-shortcuts/` pelo instalador. Atalhos que
apontem para outro projeto não são removidos.

Copie backups importantes de `backups/` para outro disco/local seguro. Os comandos
de preparo, desenvolvimento e backup continuam disponíveis para manutenção.

## Comandos equivalentes

```powershell
npm.cmd run planner:open
npm.cmd run planner:stop
npm.cmd run planner:status
npm.cmd run planner:prepare
npm.cmd run planner:dev
npm.cmd run backup
```

O endereço padrão é `http://127.0.0.1:3000`. `PLANNER_PORT` no `.env` permite
escolher outra porta. O servidor dos atalhos só escuta nesta máquina, não na rede.
Este é um aplicativo pessoal sem autenticação: não o exponha à internet.

## Se algo falhar

- **Docker:** abra o Docker Desktop e espere a inicialização terminar. O iniciador
  tenta abri-lo automaticamente no caminho padrão do Windows.
- **Porta ocupada:** encerre o servidor antigo pelo terminal em que o abriu, ou
  escolha outra `PLANNER_PORT`. O iniciador não mata processos desconhecidos.
- **Banco indisponível:** confirme Docker e `.env`; use `npm.cmd run db:logs`.
- **Erro de inicialização:** leia `.planner/daily.log` ou `.planner/dev.log`.
- **Mudanças não aparecem:** clique em **Abrir Planner** novamente. Para forçar uma
  preparação em manutenção, use `npm.cmd run planner:prepare`.
- **Operação em andamento:** espere o preparo/backup terminar antes de clicar outra
  vez. A trava impede duas inicializações ou compilações simultâneas.
- **Atalho não encontra Node:** confira `node --version` e reinicie o Explorer/PC
  após instalar Node, para atualizar o PATH.

Para desligar somente o banco pessoal, depois de parar a aplicação:
`docker compose stop db`. Nunca use `docker compose down -v` nos dados pessoais.

Não deixe servidores iniciados manualmente com `npm run dev/start` disputando a
mesma porta. O comando Parar não encerra esses servidores manuais.
