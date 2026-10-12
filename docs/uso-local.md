# Planner e Academia: guia de uso local

## No dia a dia: dois atalhos

1. **Abrir Planner** inicia/verifica Docker e PostgreSQL, prepara uma nova versão
   se o código mudou e abre o Planner. Com a Academia configurada, inicia também
   o Streamlit e o importador. O menu **Academia** abre os treinos em outra aba.
2. Substitua `E:\trabalhos\Acad\whatsapp_acad_export\Conversa do WhatsApp com Acad.txt`
   por uma exportação atualizada. Não é preciso importar manualmente.
3. **Parar Planner** encerra os processos iniciados pelo atalho, sem apagar dados
   nem desligar o PostgreSQL. Fechar o navegador não para os serviços.

O início é manual, inclusive após reiniciar o computador. Não existe inicialização
com o Windows. Não é necessário abrir VS Code nem manter o terminal aberto.
Os dois CMDs também estão na raiz do Planner.

Uma segunda abertura reutiliza os servidores. Se o importador parou, **Abrir Planner**
o reinicia sem reiniciar o dashboard. Um importador iniciado manualmente é reutilizado
e permanece ativo quando você usa **Parar Planner**. Uma falha na parada da Academia
não impede a tentativa de parar o Planner.

## Atualização do TXT e proteção dos dados

O importador verifica a entrada a cada 60 segundos, com 10 segundos adicionais
para confirmar que a cópia terminou. O dashboard aberto verifica mudanças no banco
a cada 60 segundos. Arquivos grandes ou falhas podem aumentar esse tempo.
Prefira copiar com nome temporário e substituir o TXT apenas quando a cópia terminar.

Conteúdo já importado com a mesma versão do parser não gera outra importação.
Uma atualização do parser reanalisa o arquivo uma vez. Antes de uma importação nova
ou reprocessamento automático, a Academia salva um backup em
`E:\trabalhos\Acad\local_backups\automatic`. Se o backup falhar, não altera o banco
e tenta novamente no próximo ciclo. Mensagens duvidosas ficam para revisão; o monitor
não chama IA nem aprova cargas por conta própria.

O preparo automático do Planner e `npm.cmd run backup` salvam **os dois bancos
das aplicações** em `ToDoList/backups/`, com um manifesto ligando os arquivos.
Não incluem `.env`, papéis de acesso nem os bancos históricos de comparação.
Guarde cópias importantes fora deste disco. Veja [backup e recuperação](backup.md).

## Configuração desta instalação

No `.env` do Planner:

```dotenv
GYM_TRACKER_PATH=../Acad
GYM_TRACKER_PORT=8501
```

O caminho é relativo ao Planner, não ao terminal. O iniciador usa a `.venv` da
Academia e exige um `.env` próprio dela, com `DATABASE_URL` explícita. Não herda
o banco nem as opções de importação do Planner. Se necessário, configure
`GYM_TRACKER_PYTHON` com o executável Python. As portas precisam ser diferentes.
Deixe `GYM_TRACKER_PATH` vazio para usar só o Planner; o menu Academia fica oculto.
Após mudar a configuração, pare e abra novamente.

Na Academia, `DATABASE_URL` aponta para `gym_tracker` em `localhost:5434` e
`GYM_BACKUP_CONTAINER=projeto-planejador-db-1`. Esse contêiner precisa publicar a
mesma porta da conexão. O Planner usa `planejador` no mesmo servidor, com tabelas
e migrations separadas. PostgreSQL e aplicações escutam apenas neste computador.
É um sistema pessoal sem autenticação: não exponha à internet.

## Primeira instalação

Instale Node.js compatível e Docker Desktop. No terminal do VS Code:

```powershell
cd E:\trabalhos\ToDoList
npm.cmd ci
# SOMENTE se .env ainda não existe:
Copy-Item .env.example .env
npm.cmd run shortcuts
```

Não substitua um `.env` existente. Instale a Academia separadamente seguindo seu
README. Em computador novo, restaure seus bancos e proprietários; subir apenas
o Compose do Planner não cria os bancos da Academia.

O primeiro preparo faz backup, gera Prisma, aplica migrations pendentes e compila.
Não faz seed, não baixa código do GitHub nem instala dependências automaticamente.
Após editar código, abra novamente; finalize formulários antes do reinício.
Documentação, testes, dados e backups não causam recompilação.

## Painel de status

O menu **Status** abre `/status` e reúne banco do Planner, última atualização
bem-sucedida do Chess, dashboard da Academia, importador do TXT, contagem atual
de pendências e datas dos backups. A tela consulta automaticamente a cada 30
segundos enquanto estiver visível; **Atualizar status** apenas repete a consulta.
Não busca partidas, importa mensagens, aprova revisões nem cria backups.

Datas antigas são identificadas como registros anteriores. Arquivos de estado
ou PIDs não bastam para confirmar que o importador está rodando: a confirmação
vem do supervisor autenticado. Sem ele, a tela mostra **Não foi possível confirmar**.
Pendências indisponíveis não são apresentadas como zero. Após atualizar o código,
reabra o Planner para que a Academia use também a nova consulta de pendências.

O backup é considerado registrado apenas quando o manifesto e todos os arquivos
necessários existem e não estão vazios. Um aviso aparece após sete dias sem cópia
completa pelo Planner; nada é removido automaticamente. A data do backup automático
da Academia aparece separadamente quando seu supervisor está disponível.
Essa conferência de arquivos não substitui testar uma restauração.

## Diagnóstico e manutenção

No terminal, na pasta do Planner:

```powershell
npm.cmd run planner:status
npm.cmd run backup
npm.cmd run planner:prepare
npm.cmd run planner:dev
```

`planner:status` informa dashboard e importador separadamente, incluindo o último
resultado. Para operar só o importador, use os CMDs em `Acad/scripts/maintenance/`.
Eles não são necessários no uso combinado. Desenvolvimento usa os dados reais;
os testes de integração usam bancos isolados.

- **Academia não abriu:** confira `.env`, `.venv`, porta e
  `Acad/.gym-tracker/dashboard.log`. O Planner continua disponível; o CMD pausa
  para não esconder o erro.
- **Importador parado:** abra o Planner novamente. Se registrar erro, confira
  `planner:status`, Docker, TXT e configuração do backup.
- **Backup falhou:** confira espaço livre, permissões, Docker e
  `GYM_BACKUP_CONTAINER`. Arquivos `.partial` não são backups completos.
- **Porta ocupada:** pare o processo no terminal em que o iniciou ou escolha outra
  porta. Os atalhos não encerram processos desconhecidos.
- **Planner não abriu:** confira `.planner/daily.log` ou `.planner/dev.log` e Docker.
- **Outra operação em andamento:** espere o preparo/backup terminar antes de clicar novamente.

Depois de parar ambos, `docker compose stop db` desliga só o servidor pessoal.
Nunca use `docker compose down -v` nos projetos pessoais.

Para editar sem Codex, veja [Comece aqui](../COMECE-AQUI.md) e
[manual de manutenção](manutencao.md). Detalhes técnicos da automação ficam em
`E:\trabalhos\Acad\docs\automatic-import.md`.
