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

Atividades, agenda, modelos, repetições, histórico Chess e migrations do banco.
Código, dependências, configurações `.env` e atalhos não fazem parte do `.dump`.
