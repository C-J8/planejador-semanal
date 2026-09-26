# Desenvolvimento e testes

## Trabalhar no código

Abra `Planner.code-workspace` no VS Code. **Terminal → Executar Tarefa...** oferece
comandos prontos para abrir, parar, desenvolver, testar e fazer backup. A tarefa
**Planner: verificar código** executa tipos, lint e testes unitários em sequência.
Veja o [manual de manutenção](manutencao.md) para o fluxo completo e o mapa de arquivos.

Use `npm.cmd run planner:dev` após a instalação inicial (não há atalho separado).
O comando prepara o Docker/banco e abre o navegador. O cache de desenvolvimento
fica em `.next/`; a versão preparada para uso fica em `.next-daily/`.

Ambos os modos usam o banco pessoal configurado no `.env`. A separação é da
compilação e do modo de execução, **não uma cópia dos seus dados**. Testes
automatizados, por outro lado, nunca devem usar esse banco.

Os comandos de baixo nível continuam disponíveis: `dev`, `build`, `start`,
`db:generate`, `db:migrate` e `db:deploy`. `build/start` usam `.next` por padrão;
os atalhos usam `PLANNER_MODE=daily` e `.next-daily`.

O atalho Abrir verifica mudanças e prepara a versão de uso automaticamente.
Hashes dos arquivos e configurações são registrados em `.planner/build.json`,
junto ao identificador da compilação, somente após sucesso. O arquivo não guarda
credenciais em texto. Testes, documentação, cliente gerado, backups e logs ficam
fora da comparação. Um preparo interrompido/falho será tentado novamente ao abrir.
Não há instalação automática de dependências: use `npm.cmd ci` quando necessário.

## Verificações

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run test:unit
npm.cmd run test:integration
npm.cmd run planner:prepare
```

`npm.cmd test` executa as duas suítes. `test:integration` inicia um serviço próprio
do `compose.test.yaml`, aplica migrations, insere apenas os dados sintéticos
necessários e executa os testes. Ele usa **planner_test em 127.0.0.1:5435**, enquanto
o banco pessoal padrão permanece em 5434. Não compartilha volume com o pessoal.
Os dados de teste são descartáveis e ficam em memória no contêiner.

`TEST_DATABASE_URL`, quando definido, é validado: não aceita outro host, porta,
usuário, banco ou parâmetros de conexão que desviem o destino. O setup do Vitest
também impõe o isolamento em chamadas diretas do Vitest. Essas chamadas diretas
pressupõem que o banco de testes já foi preparado pelo comando acima.

Executar somente Chess:

```powershell
npm.cmd run test:integration -- src/modules/chess/services/chess-progress.integration.test.ts
```

Encerrar o banco de testes: `npm.cmd run test:db:stop`.

Se uma execução interrompida deixar dados de teste inconsistentes, recrie
**somente o serviço descartável**:

```powershell
docker compose -f compose.test.yaml down
npm.cmd run test:integration
```

## Mudanças no banco e publicação

Faça backup antes de criar/aplicar alterações estruturais. Revise a migration
gerada e execute a suíte de integração no banco isolado. `planner:prepare` aplica
migrations existentes, mas não cria migrations novas nem faz seed no banco pessoal.

Não publique `.env`, `.planner/`, `backups/`, dados pessoais ou logs. Os diretórios
de runtime e de backups já estão ignorados pelo Git. Nada é enviado ao GitHub pelos
atalhos. Leia também [arquitetura](arquitetura.md) e [backup](backup.md).

## Conferência manual do Chess

Depois de alterar o formulário ou a sincronização:

1. Abra Acompanhamento → Xadrez e escolha uma modalidade e um período.
2. Anote a “Última atualização” e clique em **Atualizar agora**. Espere cinco
   minutos desde a sincronização anterior para testar uma nova importação.
3. Após a importação, confira a tela recarregada automaticamente, o botão novamente
   disponível e a data atualizada **sem F5**. A modalidade e o período devem
   permanecer selecionados.
4. Clique novamente: a mensagem de intervalo mínimo deve aparecer e o botão
   deve voltar a ficar disponível, sem carregamento infinito.

Essa conferência importa as partidas públicas para o banco pessoal; não é um
teste isolado. A suíte de integração simula a API e usa apenas o banco de testes.
Não altere datas no banco pessoal para contornar o intervalo entre importações.

O formulário controla a espera localmente e recarrega a página automaticamente
após uma confirmação de sucesso, mantendo modalidade e período na URL. Erros não
recarregam a página, para preservar a mensagem. Se a resposta não chegar em 150
segundos, ele libera o botão com um aviso; isso não cancela uma operação que ainda
esteja terminando no servidor.
