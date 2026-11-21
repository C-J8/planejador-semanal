# Preparação do app de treinos para amigos

Revisão em 20/11/2026. Objetivo confirmado: uso pessoal e em um grupo de
amigos, combinando registro detalhado de treinos com desafios de constância.
Este documento registra a revisão e a ordem proposta. A união dos repositórios
e as correções do parser indicadas abaixo estão concluídas; a base de sessões, fichas, identidade nas análises e login na API também foi
implementada. As telas móveis e o acesso por pessoa no Planner continuam pendentes.
Veja o [contrato da base do app](base-do-app.md).

## Situação atual

O Gym Tracker já fornece importação rastreável, revisão humana, catálogo de
exercícios e variantes, séries, histórico, gráficos, migrations e backups.
Essa base deve ser aproveitada. O Streamlit atende à consulta e administração;
o fluxo de registrar um treino pelo celular ainda precisa ser construído.

O Planner já abre a Academia, mas sua rota `/academia` redireciona para
`127.0.0.1:8501`. Isso funciona na máquina local; no celular de um amigo,
`127.0.0.1` aponta para o próprio celular. O acesso do grupo precisa de um
endereço de servidor e de identificação de quem está usando o aplicativo.

A união está publicada no
[`planejador-semanal`](https://github.com/C-J8/planejador-semanal), preservando
os dois históricos. A instalação unificada usa o Planner na raiz e a Academia
em `apps/gym-tracker`. Exports e backups pessoais podem continuar fora do
checkout, com caminhos absolutos na configuração privada.

## Prioridades antes das telas novas

### 1. Sessões de treino independentes do importador

Implementado na migração `0005` e em `services/workouts.py`: sessões com
identidade, proprietário, estado, início/término, revisão e séries ordenadas.
Fichas reutilizáveis são copiadas ao iniciar uma sessão. Seus alvos não
contam como séries realizadas, e edições na ficha não mudam a sessão.

Séries do app não exigem parsing; séries importadas continuam vinculadas ao
resultado ativo. Rascunhos e cancelamentos ficam fora das análises. O serviço
compartilhado `services/imported_workouts.py` atende importador e revisão.
Os horários históricos desconhecidos permanecem nulos. A importação normal
reutiliza resultados aceitos, inclusive ao atualizar o parser, e não reabre
rejeições humanas. Correções confirmadas continuam preservadas mesmo na
reavaliação administrativa explícita.

### 2. Pessoas e permissões

A API da Academia tem login, sessões revogáveis e verificação de proprietário
em cada operação de treino ou ficha. As contas são provisionadas pelo
administrador, sem senha padrão ou cadastro público. O usuário do
dashboard é escolhido por configuração do servidor. As tabelas do Planner
não têm proprietário por pessoa.

O isolamento de treinos e fichas na API está implementado e testado com duas
pessoas. A tela de login e o compartilhamento com grupos ainda faltam. Cada
pessoa edita seus próprios treinos; os integrantes de um grupo acessam somente
os dados compartilhados com ele. Se o Planner também for disponibilizado aos
amigos, suas atividades e eventos precisam de proprietário antes disso.

Um treino privado não deve se tornar público por participar de um desafio.
Fotos e publicações devem ter acesso associado ao grupo. Um catálogo comum
pode coexistir com exercícios e aliases pessoais, sem transformar uma
preferência de um integrante em regra para todos.

### 3. Preservar identidade nas análises

Implementado: as consultas preservam IDs de sessão e variante, base da carga
e local. Os últimos cinco treinos selecionam sessões, distinguindo duas sessões
no mesmo dia. Os gráficos e recordes mantêm variantes separadas, inclusive
aparelhos com o mesmo nome. Dias ativos e sessões realizadas são contados
separadamente; as cores das séries e as lacunas de registros são preservadas.

### 4. Ambiguidades do parser — corrigidas na versão 3.0.2

Reproduções que motivaram as correções, sem alterar dados pessoais:

| Entrada                                                | Antes da correção                         | Tratamento implementado                                                     |
| ------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------- |
| `Triceps corda cima(nfiz) 9.1kg/10rep .. 11.3kg/10rep` | Extrai duas séries sem aviso              | Reconhecer exercício não realizado antes de remover comentários             |
| `Supino reto 40kg/4rep/4`                              | Extrai quatro séries de quatro repetições | Encaminhar abreviação ambígua para revisão; não multiplicar silenciosamente |
| `Supino reto 40kg/10rep/0rep`                          | Mantém só a série de dez, sem aviso       | Registrar o trecho inválido para revisão                                    |
| `Supino reto 40kg/10rep/999rep`                        | Mantém só a série de dez, sem aviso       | Registrar o trecho inválido para revisão                                    |
| `Supino inclinado maquina com anilha`                  | Detecta equipamento genérico `Máquina`    | Preservar a variante explícita com anilha                                   |

As correções receberam testes específicos de parsing e importação, incluindo
bloqueio da autoaceitação por IA e preservação de uma correção humana aceita
quando a nova análise exige revisão. A versão é `3.0.2`. A instalação unificada
foi atualizada com backup e migração ensaiada em uma cópia do banco. A revisão
dos dados foi encerrada; a atualização manteve todas as séries e decisões humanas. Veja o
[guia operacional](../apps/gym-tracker/docs/operations.md) antes de adotar a
versão em um banco existente. O registro direto de treinos já está
desacoplado do WhatsApp; as telas móveis consumirão essa API.

### 5. Separar apresentação, regras e operação local

`app.py` tem 560 linhas com tema, filtros, gráficos e agregações. Levar os
cálculos para serviços de análise e manter componentes de apresentação
separados. O módulo de últimos treinos já demonstra parte dessa separação.

Manter uma única implementação das regras de carga, variante, conclusão e
recordes, consumida pela API e pelas interfaces. O Python pode continuar
responsável pelo domínio da Academia; o Next.js do Planner pode consumir
essa API. Evitar Prisma e SQLAlchemy gerenciando as mesmas tabelas.

Os supervisores de desktop, CMDs e backups locais são úteis para a instalação
atual e a manutenção. Não devem virar dependências do uso pelos amigos.
O servidor que atende o grupo precisa funcionar sem o computador pessoal
estar aberto; hospedagem e backups precisam ser definidos antes do piloto.

## Organização sugerida

O repositório unificado tem o Planner na raiz e a Academia
em `apps/gym-tracker`. Dentro da Academia, separar gradualmente:

- **Treinos e fichas:** criação, edição, conclusão, exercícios e séries.
- **Importação:** WhatsApp, parsing, evidências e revisão.
- **Análises:** histórico, comparações e recordes de carga/repetições.
- **Grupos:** integrantes, convites, desafios, pontuação e publicações.
- **API:** acesso autenticado às operações e consultas.

Não é necessário criar serviços independentes para esses módulos.

Mover utilitários antigos, como `gerar_csv_whatsapp.py`, para uma área de
manutenção quando seus usos forem atualizados. CSVs históricos, SQLite antigo,
exports e backups precisam ser reconciliados ou preservados antes de qualquer
remoção. Dependências ficam definidas por `pyproject.toml` e `uv.lock`;
`requirements.txt` pode permanecer como compatibilidade enquanto for usado.
Uma limpeza de caches deve distinguir ambientes ativos e backups válidos.

## Primeira versão para o grupo

Fluxo principal: abrir uma ficha, iniciar treino, registrar cada série com a
última carga/repetições visíveis, acompanhar o descanso e concluir.

| Área      | Primeira entrega                                               |
| --------- | -------------------------------------------------------------- |
| Hoje      | Próximo treino, meta semanal e atividade recente dos amigos    |
| Treinar   | Fichas A/B/C, registro rápido, descanso e retomada de rascunho |
| Histórico | Sessões, últimos cinco treinos e recordes por variante         |
| Grupo     | Convite, check-in, desafio semanal e ranking de constância     |
| Perfil    | Dados da pessoa e preferências de compartilhamento             |

Concluir um treino pode gerar um único check-in, conforme a regra do desafio.
Contar presença por dia do grupo evita pontuar cada série ou cada edição.
Reimportar dados, reenviar uma requisição ou editar um treino não pode gerar
outros pontos. Importações históricas não devem publicar uma sequência de
check-ins novos no grupo. Definir fuso e período do desafio antes da pontuação.
Evitar comparar integrantes pelo total de quilos levantados em aparelhos
diferentes. Foto e mensagem podem acompanhar o check-in, com visibilidade
explícita; curtidas e comentários podem entrar depois do registro básico.

O app precisa salvar o treino em andamento no aparelho e mostrar quando a
sincronização está pendente. Reenvios devem usar identificadores estáveis para
evitar duplicatas. O descanso deve ser calculado pelo horário de término,
permitindo recuperar o tempo correto após bloquear a tela ou reabrir o app.
Instalação na tela inicial e funcionamento offline são entregas diferentes.

Uma PWA usando o Next.js existente é uma opção para validar o piloto com
menos interfaces para manter. Um aplicativo nativo com React Native/Expo
pode consumir a mesma API depois, se a experiência e as funções do celular
justificarem essa etapa. A persistência e a sincronização precisam ser
implementadas e testadas em qualquer opção.

## Ordem de entrega e validação

1. **Concluído:** união dos repositórios e registro das melhorias locais.
2. **Concluído:** parser 3.0.2 e identidade nas consultas e comparações.
3. **Concluído:** serviços de sessões e fichas separados da importação.
4. **API da Academia concluída:** login e isolamento testados entre duas pessoas.
   Faltam as telas e a adaptação do Planner para acesso por pessoa.
5. Entregar fichas, registro ao vivo, salvamento local e sincronização.
6. Acrescentar grupos, convites, check-ins e desafio de constância.

Verificar especialmente: reenvio sem duplicar séries/pontos; alteração de ficha
sem modificar sessões antigas; cancelamento sem pontuar; duas sessões no mesmo
dia; fuso do desafio; entrada em grupo sem expor treinos privados; reimportação
sem perder correções nem publicar dados pessoais do WhatsApp.

Na verificação local desta revisão, os 54 testes existentes de parser, últimos
treinos e peso corporal passaram. As reproduções acima expuseram lacunas que
não são cobertas por esses testes. Na publicação da consolidação, o CI passou
com os 195 testes da Academia, incluindo PostgreSQL, e as suítes do Planner.

Na entrega da base do app, passaram os 256 testes da suíte completa da Academia
com PostgreSQL. Um caso adicional de bloqueio de login e privacidade do catálogo
também passou na suíte específica. O Planner passou nos 271 testes unitários,
nos 85 de integração, na verificação de tipos e na compilação.

## Referências de produto e implementação

- [Hevy: rotinas, registro de séries, descanso, histórico e amigos](https://www.hevyapp.com/)
- [GymRats: grupos, desafios e pontuação](https://www.gymrats.app/)
- [Next.js: aplicação web instalável](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Expo: persistência local com SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
