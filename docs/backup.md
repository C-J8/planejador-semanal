# Backup e restauração

## Criar uma cópia

O Planner faz backup automaticamente antes de preparar uma versão nova ao abrir.
Para uma cópia extra, execute `npm.cmd run backup`; não há atalho separado.

O comando inicia/verifica o PostgreSQL do projeto e gera um arquivo PostgreSQL
custom (`.dump`) na pasta `backups/`, com data e identificador único. Ele verifica
se `DATABASE_URL` aponta para o mesmo banco local configurado no Compose, evitando
salvar por engano outro banco. Não cobre bancos remotos.

O arquivo só recebe a extensão final após o `pg_dump` terminar com sucesso.
Arquivos `.partial` indicam falha e não devem ser usados para restauração. Cada
execução cria uma cópia nova; nenhuma cópia anterior é sobrescrita ou removida.
O preparo da versão de uso também cria backup antes de aplicar migrations.

Com a Academia configurada, o comando também chama o backup do Gym, lendo seu
próprio `.env`, e salva outro arquivo `gym-*.dump` na mesma pasta. Um manifesto
`planner-*.dump.json` associa os dois arquivos. O comando só indica sucesso completo
depois de salvar ambos; se a Academia falhar, o preparo é interrompido e o dump
do Planner já criado continua válido. Não é uma transação entre os dois bancos:
cada dump é um snapshot consistente da sua aplicação.

Backups contêm seus dados pessoais. Não são enviados ao GitHub. Mantenha uma
cópia externa; guardar tudo no mesmo disco não protege contra perda do disco.

## Restaurar com segurança

A restauração disponível cria **outro banco**, com nome começando por
`planner_restore_`. Não substitui o banco atual nem modifica `.env`.

```powershell
npm.cmd run backup:restore -- "E:\trabalhos\ToDoList\backups\SEU_ARQUIVO.dump" planner_restore_conferencia
```

O nome deve usar letras minúsculas, números e `_`. Se já existir, a operação é
recusada. O restore usa transação única; se falhar, o banco novo pode permanecer
vazio, mas o original continua intacto. Não repetimos com `--clean` nem apagamos
bancos automaticamente.

Para recuperar efetivamente a aplicação, primeiro confira os dados restaurados.
Depois, com o Planner parado e outro backup guardado, configure o banco restaurado
no `.env` (`POSTGRES_DB` e o nome do banco em `DATABASE_URL`) e prepare a aplicação.
Nunca altere/remova o volume pessoal para fazer essa troca. Em um volume existente,
`POSTGRES_DB` não recria o banco: o banco restaurado já deve existir.

## O que está incluído

Atividades, agenda, modelos, repetições, histórico Chess e migrations do Planner;
na cópia da Academia, treinos, mensagens, revisões, catálogo e migrations do Gym.
Código, dependências, configurações `.env` e atalhos não fazem parte do `.dump`.

## Servidor compartilhado com a Academia

Nesta instalação, o servidor do Planner na porta 5434 também hospeda
`gym_tracker`, `gym_tracker_stage2_csv` e `gym_tracker_stage2_txt`. Os bancos
continuam separados: a cópia rotineira cobre `planejador` e `gym_tracker` quando
a Academia está configurada, mas não inclui os dois bancos de comparação.
Parar o serviço `db` afeta os dois projetos; nunca remova seu volume para
reinstalar apenas um deles. O banco de testes do Planner continua isolado.

Os backups completos anteriores à consolidação de 29/09/2026 estão em
`E:\trabalhos\Acad\local_backups\postgres-consolidation-20260929`.
O guia de uso e recuperação está em `E:\trabalhos\Acad\docs\shared-postgres.md`.
O importador cria um backup novo em `Acad/local_backups/automatic` antes de uma
importação nova ou mudança de parser. Arquivo/versão já processados não geram
outra cópia. Se o backup falhar, nenhum dado é importado; o monitor informa erro
e tenta novamente. Antes de comandos manuais ou migrations do Gym, faça um backup.

Os dumps não contêm papéis/senhas, `.env` nem arquivos de entrada. A restauração
de um dump da Academia também pode usar `backup:restore` em um banco novo
`planner_restore_conferencia_gym`, somente para conferência. Não aponte o Planner
para esse banco: ele contém o schema da Academia. Uma recuperação efetiva do Gym
exige conferir os dados e configurar sua própria conexão/proprietário.

Não há limpeza automática de backups. Confira espaço livre e guarde cópias externas.
