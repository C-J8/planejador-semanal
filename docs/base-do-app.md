# Base do aplicativo

O domínio da Academia aceita sessões registradas diretamente, sem criar mensagens
ou importações fictícias. A migração `0005` adiciona sessões, fichas e contas;
o histórico importado mantém seus IDs, séries e resultados de revisão.

## Instalação local

Use um checkout do repositório unificado como pasta de trabalho. O Planner fica
na raiz e a Academia em `apps/gym-tracker`. Os dois `.env` continuam separados.
`GYM_TRACKER_PATH=./apps/gym-tracker` conecta os atalhos às duas aplicações.
Exporte backups antes de migrar um banco existente. Não altere o nome do projeto
Compose nem do volume PostgreSQL ao trocar de pasta.

Os exports e backups podem continuar em seus caminhos anteriores; configure
`GYM_IMPORT_FILE` e `GYM_BACKUP_DIRECTORY` com caminhos absolutos nesse caso.
Eles não devem ser enviados ao Git. Execute:

```powershell
npm.cmd ci
npm.cmd run gym:install
cd apps/gym-tracker
.venv\Scripts\python.exe -m gym_tracker.backup
.venv\Scripts\python.exe -m alembic upgrade head
.venv\Scripts\python.exe -m alembic check
```

O parser permanece na `3.0.2`. Ao atualizar a versão ou receber outro export,
a importação normal reaproveita resultados aceitos e rejeições humanas.
Somente mensagens novas passam a gerar séries novas. A chamada administrativa
`import_whatsapp_file(..., reprocess_existing=True)` permite reavaliar resultados
automáticos numa nova versão; decisões humanas continuam preservadas.
Uma revisão humana explícita é o caminho para corrigir uma decisão já confirmada.

## Sessões e fichas

`services/workouts.py` concentra as operações de fichas e sessões. Uma ficha
tem proprietário, revisão e exercícios ordenados com séries alvo e descanso.
Iniciar um treino copia a ficha; as séries alvo não contam como séries realizadas.
Editar a ficha posteriormente não modifica o treino iniciado ou concluído.

O ID enviado ao iniciar o treino permite repetir a requisição sem duplicação.
Salvar exige a revisão atual, evitando que um aparelho sobrescreva uma alteração
mais recente. Séries existentes mantêm seus IDs ao editar carga e repetições.
O estado pode ser rascunho, em andamento, concluído ou cancelado; o fluxo inicial
da API começa em andamento. Apenas sessões concluídas entram nas análises.
Concluir novamente é uma operação idempotente; cancelar não gera presença.
Nenhuma pontuação ou publicação social é gerada nesta etapa.

Treinos importados continuam ligados aos resultados ativos de parsing e são
corrigidos pelo fluxo de revisão. `services/imported_workouts.py` é usado tanto
pelo importador quanto pela revisão, sem dependência da orquestração do WhatsApp.
Os horários antigos desconhecidos permanecem nulos.

## Análises

As consultas mantêm os IDs de sessão e variante, a base da carga e o local.
Últimos treinos seleciona cinco sessões do músculo, inclusive sessões distintas
no mesmo dia. Os gráficos preservam as cores por série e as lacunas de séries
ausentes. Variantes diferentes não são fundidas pelo nome ou equipamento.
Dias ativos e quantidade de sessões são medidas separadas.

## API e contas

Execute a API local a partir de `apps/gym-tracker`:

```powershell
.venv\Scripts\python.exe -m uvicorn gym_tracker.api:create_app --factory --host 127.0.0.1 --port 8001
```

O contrato navegável fica em `http://127.0.0.1:8001/docs`. O administrador cria
o acesso para um usuário existente; a senha é solicitada de forma oculta:

```powershell
.venv\Scripts\python.exe -m gym_tracker.accounts --user-id UUID-DA-PESSOA --login nome
```

Não existe cadastro público nem associação automática de contas ao histórico.
O login `POST /auth/login` entrega um token válido por 24 horas. O banco guarda
apenas seu hash; `POST /auth/logout` revoga o token. Senhas têm hash com sal
individual. Cinco falhas bloqueiam temporariamente o login por cinco minutos.
Nenhuma conta real ou senha padrão é criada pela migração.

| Operação                           | Rota                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| Pessoa autenticada                 | `GET /me`                                                    |
| Variantes disponíveis              | `GET /catalog`                                               |
| Consultar e salvar fichas          | `GET /routines`, `PUT /routines/{id}`                        |
| Iniciar, consultar e salvar sessão | `POST /workouts`, `GET /workouts/{id}`, `PUT /workouts/{id}` |
| Concluir ou cancelar               | `POST /workouts/{id}/complete`, `POST /workouts/{id}/cancel` |
| Séries concluídas para análise     | `GET /history`                                               |

As rotas exigem `Authorization: Bearer TOKEN`, exceto o login e a documentação.
O proprietário sempre vem do token: informar `user_id` no corpo é rejeitado.
Fichas e treinos de outra pessoa retornam 404. O catálogo comum não contém
conversas ou aliases pessoais. As respostas privadas não devem ser armazenadas
em caches compartilhados.

## Entrega seguinte

Esta base ainda precisa das telas móveis e da tela de login. O piloto do grupo
também depende de convites, regras de compartilhamento, hospedagem com HTTPS e
salvamento/sincronização no celular. A API desta etapa mantém os treinos privados.

O Planner e o Streamlit continuam aplicações locais de manutenção e consulta.
O Planner ainda tem um único conjunto de atividades, sem propriedade por pessoa:
seu acesso não deve ser aberto ao grupo como parte da API da Academia.
Antes de disponibilizá-lo aos amigos, é preciso adicionar proprietário em suas
tabelas e exigir autenticação em consultas e ações, além das telas correspondentes.

## Validação

Os testes cobrem login, revogação e expiração, acesso entre duas pessoas, IDs
reenviados, conflitos de revisão, conclusão repetida, cancelamento, fichas
independentes das sessões, duas sessões no mesmo dia e variantes separadas.
As migrações e regressões são verificadas em SQLite e PostgreSQL. Uma cópia
restaurada do banco pessoal permite ensaiar a atualização e comparar o histórico
antes da troca de instalação; esses relatórios permanecem privados.
