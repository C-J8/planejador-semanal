# Preparação do app de treinos para amigos

Revisão em 19/11/2026. Objetivo confirmado: uso pessoal e em um grupo de
amigos, combinando registro detalhado de treinos com desafios de constância.
Este documento registra a revisão e a ordem proposta; as mudanças descritas
ainda não estão implementadas.

## Situação atual

O Gym Tracker já fornece importação rastreável, revisão humana, catálogo de
exercícios e variantes, séries, histórico, gráficos, migrations e backups.
Essa base deve ser aproveitada. O Streamlit atende à consulta e administração;
o fluxo de registrar um treino pelo celular ainda precisa ser construído.

O Planner já abre a Academia, mas sua rota `/academia` redireciona para
`127.0.0.1:8501`. Isso funciona na máquina local; no celular de um amigo,
`127.0.0.1` aponta para o próprio celular. O acesso do grupo precisa de um
endereço de servidor e de identificação de quem está usando o aplicativo.

A consolidação anterior foi encontrada no início desta revisão em
`local_backups/repository-union-20261111`, na branch local
`integration/gym-tracker-monorepo`, com merge ainda não concluído naquele
momento. A consulta inicial ao GitHub confirmou que ela ainda não havia sido
publicada no `planejador-semanal`. A publicação precisa incluir as alterações
locais importantes do Gym Tracker, como as migrations 0003/0004 e os últimos
treinos, preservando o histórico dos dois projetos.

## Prioridades antes das telas novas

### 1. Sessões de treino independentes do importador

Hoje `WorkoutSet.parse_result_id` é obrigatório. A criação de treinos está em
`services/whatsapp_import.py::_materialize_extraction`, usada inclusive pela
revisão humana por meio de uma função privada. A consulta do dashboard exige
um resultado de parsing ativo para mostrar as séries.

Extrair um serviço de treino compartilhado por registro direto, edição e
importação. Uma sessão precisa de identidade estável, usuário, estado
(rascunho, em andamento, concluído, cancelado), exercícios ordenados e séries
ordenadas. Início, término, notas e descanso atendem ao registro ao vivo.
Fichas reutilizáveis devem ser separadas das sessões realizadas: alterar uma
ficha não pode alterar o histórico.

Manter a origem e o histórico das importações. Retirar a obrigatoriedade de
`parse_result_id` sem mudar a consulta não basta: as séries diretas ficariam
invisíveis, e remover o filtro de resultado ativo somaria versões antigas.
Reimportações também precisam preservar as correções feitas no app.

Não preencher horários ou durações desconhecidos nos treinos históricos.
Dados exportados e registros manuais antigos podem ter apenas a data.

### 2. Pessoas e permissões

O `User` da Academia tem apenas identificação e nome, sem login. O usuário do
dashboard é escolhido por configuração do servidor. As tabelas do Planner
não têm proprietário por pessoa.

Criar identidade de acesso e exigir usuário em cada operação da API. Cada
pessoa edita seus próprios treinos; os integrantes de um grupo acessam somente
os dados compartilhados com ele. Se o Planner também for disponibilizado aos
amigos, suas atividades e eventos precisam de proprietário antes disso.

Um treino privado não deve se tornar público por participar de um desafio.
Fotos e publicações devem ter acesso associado ao grupo. Um catálogo comum
pode coexistir com exercícios e aliases pessoais, sem transformar uma
preferência de um integrante em regra para todos.

### 3. Preservar identidade nas análises

`DashboardRepository.workout_dataframe` não retorna os IDs de treino e
variante, a base da carga nem o local/aparelho. Os últimos treinos agrupam por
data, nome e tipo. Em uma reprodução com duas sessões e variantes diferentes
no mesmo dia, o resumo as juntou em uma única linha.

Usar IDs de sessão e variante nas consultas e comparações. Distinguir
explicitamente dias ativos de sessões realizadas. Comparações de carga
precisam manter exercício, equipamento, base da carga e aparelho/local
compatíveis. A numeração da série pertence ao exercício dentro da sessão.

### 4. Corrigir as ambiguidades do parser

Reproduções executadas com o código atual, sem alterar dados:

| Entrada | Comportamento atual | Tratamento necessário |
| --- | --- | --- |
| `Triceps corda cima(nfiz) 9.1kg/10rep .. 11.3kg/10rep` | Extrai duas séries sem aviso | Reconhecer exercício não realizado antes de remover comentários |
| `Supino reto 40kg/4rep/4` | Extrai quatro séries de quatro repetições | Encaminhar abreviação ambígua para revisão; não multiplicar silenciosamente |
| `Supino reto 40kg/10rep/0rep` | Mantém só a série de dez, sem aviso | Registrar o trecho inválido para revisão |
| `Supino reto 40kg/10rep/999rep` | Mantém só a série de dez, sem aviso | Registrar o trecho inválido para revisão |
| `Supino inclinado maquina com anilha` | Detecta equipamento genérico `Máquina` | Preservar a variante explícita com anilha |

As correções precisam de testes específicos e versão nova do parser. Não
reprocessar o histórico inteiro automaticamente sem conferir as decisões
humanas já aceitas. O WhatsApp passa a ser uma entrada de histórico, sem ser
necessário para registrar treinos novos no app.

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

Concluir primeiro a consolidação já preparada, com Planner na raiz e Academia
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

| Área | Primeira entrega |
| --- | --- |
| Hoje | Próximo treino, meta semanal e atividade recente dos amigos |
| Treinar | Fichas A/B/C, registro rápido, descanso e retomada de rascunho |
| Histórico | Sessões, últimos cinco treinos e recordes por variante |
| Grupo | Convite, check-in, desafio semanal e ranking de constância |
| Perfil | Dados da pessoa e preferências de compartilhamento |

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

1. Concluir a união dos repositórios e registrar as melhorias locais.
2. Corrigir o parser e preservar identidade nas consultas.
3. Separar o serviço de treinos da importação e migrar sem perder o histórico.
4. Criar login, propriedade dos dados e API; testar acesso entre duas pessoas.
5. Entregar fichas, registro ao vivo, salvamento local e sincronização.
6. Acrescentar grupos, convites, check-ins e desafio de constância.

Verificar especialmente: reenvio sem duplicar séries/pontos; alteração de ficha
sem modificar sessões antigas; cancelamento sem pontuar; duas sessões no mesmo
dia; fuso do desafio; entrada em grupo sem expor treinos privados; reimportação
sem perder correções nem publicar dados pessoais do WhatsApp.

Nesta revisão, os 54 testes existentes de parser, últimos treinos e peso
corporal passaram. As reproduções acima expuseram lacunas que não são
cobertas por esses testes. Não foram executados testes PostgreSQL nesta revisão.

## Referências de produto e implementação

- [Hevy: rotinas, registro de séries, descanso, histórico e amigos](https://www.hevyapp.com/)
- [GymRats: grupos, desafios e pontuação](https://www.gymrats.app/)
- [Next.js: aplicação web instalável](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [Expo: persistência local com SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
