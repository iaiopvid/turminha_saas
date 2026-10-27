# Matriz de requisitos e aceite

Cada requisito do mestre tem uma linha e evidência. “Parcial local” significa que apenas a fatia descrita foi executada em MariaDB 10.10.7; não equivale a MySQL 8, sandbox, homologação ou produção. Os 80 cenários seguem como requisitos, nenhum grupo foi aprovado por inferência.

| ID | Cenário (texto do mestre) | Estado | Evidência / pendência |
|---|---|---|---|
| T01 | Escola A e escola B não conseguem ler ou alterar recursos uma da outra, mesmo manipulando IDs, rotas e host. | Parcial local (MariaDB) | `smoke:m1` e `smoke:m2`; cenarios adversariais completos ainda pendentes. |
| T02 | Professora só acessa turmas atribuídas; responsável só acessa crianças/conteúdos autorizados. | Parcial local (MariaDB) | `smoke:m2`: equipe vinculada e associação cross-tenant negada; matriz completa de escopos pendente. |
| T03 | Usuário com múltiplos papéis/escolas troca contexto sem misturar dados, caches ou notificações. | Parcial local (MariaDB) | `smoke:m1`: mesma conta em dois tenants; cache/notificacoes nao cobertos. |
| T04 | Dois responsáveis têm contas independentes; revogar um não remove nem concede acesso ao outro. | Pendente | Sem implementacao/teste completo registrado. |
| T05 | Convite expirado, revogado, reaproveitado ou destinado a outra pessoa é recusado. | Parcial local (MariaDB) | `smoke:m2:lifecycle`: aceitação e replay do token recusado; expiração/revogação e titularidade do e-mail ainda sem teste. |
| T06 | Permissão revogada bloqueia novas ações e downloads, inclusive jobs agendados anteriormente. | Pendente | Sem implementacao/teste completo registrado. |
| T07 | Criar registro executado alimenta diário/evidências/portfólio por fluxo controlado, sem duplicação ou publicação implícita. | Pendente | Sem implementacao/teste completo registrado. |
| T08 | Aluno ausente não recebe automaticamente evidência individual de atividade coletiva. | Pendente | Sem implementacao/teste completo registrado. |
| T09 | Frequência não duplica em retries nem presume presença antes do lançamento. | Parcial local (MariaDB) | Chamada M1 persiste; idempotencia e retries concorrentes nao verificados. |
| T10 | Responsável pode enviar/excluir upload próprio; conteúdo enviado à escola segue moderação e regras claras. | Pendente | Sem implementacao/teste completo registrado. |
| T11 | Álbum privado familiar não é acessível ao professor apenas por seu papel. | Pendente | Sem implementacao/teste completo registrado. |
| T12 | Foto com múltiplas crianças não é publicada para audiência ampliada sem todas as condições necessárias. | Pendente | Sem implementacao/teste completo registrado. |
| T13 | Revogar autorização retira publicação pertinente, invalida caches/variantes e bloqueia novas exportações. | Pendente | Sem implementacao/teste completo registrado. |
| T14 | Arquivo malicioso, tipo falso, tamanho excedido ou imagem descomprimida abusiva não é liberado. | Pendente | Sem implementacao/teste completo registrado. |
| T15 | Duas tentativas simultâneas de upload não ultrapassam silenciosamente a quota. | Pendente | Sem implementacao/teste completo registrado. |
| T16 | Relatório publicado tem versão; mudanças posteriores não reescrevem o documento já entregue. | Pendente | Sem implementacao/teste completo registrado. |
| T17 | IA não inclui fatos sem evidência, não aceita objetivo curricular inventado e não publica sozinha. | Pendente | Sem implementacao/teste completo registrado. |
| T18 | Prompt injection em anexo/anotação não concede acesso ou ferramentas à IA. | Pendente | Sem implementacao/teste completo registrado. |
| T19 | Webhook duplicado/fora de ordem não duplica cobrança nem reativa assinatura cancelada indevidamente. | Pendente | Sem implementacao/teste completo registrado. |
| T20 | Retorno do checkout sem pagamento confirmado não libera plano pago. | Pendente | Sem implementacao/teste completo registrado. |
| T21 | Upgrade/downgrade respeita vigência e limites sem apagar arquivos ou matrículas. | Pendente | Sem implementacao/teste completo registrado. |
| T22 | Leitura de mensagem não é confundida com ciência, consentimento ou entrega de e-mail. | Pendente | Sem implementacao/teste completo registrado. |
| T23 | Duas famílias não reservam simultaneamente o mesmo horário de reunião. | Pendente | Sem implementacao/teste completo registrado. |
| T24 | Migração/virada de ano preserva matrículas, autores, arquivos e histórico anterior. | Parcial local (MariaDB) | `smoke:m2:lifecycle`: matrícula antiga fica FINISHED e nova é vinculada por histórico de virada; autores/arquivos não exercitados. |
| T25 | Exportação de um responsável não inclui informações privadas de colegas ou de outro responsável restrito. | Pendente | Sem implementacao/teste completo registrado. |
| T26 | Job interrompido pode ser retomado sem duplicar mensagens, arquivos ou efeitos financeiros. | Pendente | Sem implementacao/teste completo registrado. |
| T27 | Cache/service worker não entrega conteúdo da sessão anterior após logout/troca de escola. | Pendente | Sem implementacao/teste completo registrado. |
| T28 | Funcionamento mobile, teclado e leitores de tela dos fluxos críticos é validado. | Pendente | Sem implementacao/teste completo registrado. |
| T29 | Fluxo completo da primeira escola até o primeiro registro publicado funciona sem editar o banco. | Parcial local (MariaDB) | Gestão cria unidade/turma; CSV importa e matricula; convite/onboarding/calendário passam smoke local; primeiro registro guiado ponta a ponta ainda pendente. |
| T30 | PDF/livro apresenta texto e imagens corretos, sem páginas cortadas, permissões indevidas ou URLs expostas. | Pendente | Sem implementacao/teste completo registrado. |
| T31 | Backup pode ser restaurado em ambiente isolado e os registros excluídos não reaparecem indevidamente. | Pendente | Sem implementacao/teste completo registrado. |
| T32 | Migrações funcionam em banco vazio e em cópia sanitizada do esquema anterior. | Pendente | Sem implementacao/teste completo registrado. |
| T33 | Concessão de suporte expira e deixa trilha auditável; operador comum não abre portfólios privados. | Pendente | Sem implementacao/teste completo registrado. |
| T34 | Dados/segredos não aparecem em logs, e-mails, push, URLs públicas ou respostas de erro. | Pendente | Sem implementacao/teste completo registrado. |
| T35 | Demo, sandbox e produção não compartilham dados nem credenciais operacionais. | Pendente | Sem implementacao/teste completo registrado. |
| T36 | Domínio não verificado, callback adulterado ou header de host falso não muda o tenant autorizado. | Pendente | Sem implementacao/teste completo registrado. |
| T37 | Encerramento de contrato e pedido de exclusão respeitam retenções documentadas e direitos de acesso. | Pendente | Sem implementacao/teste completo registrado. |
| T38 | Falta de provedor de e-mail/IA/cobrança é explicitada; o sistema não simula sucesso real. | Parcial implementado | Convites e CSV dizem que links são compartilhados manualmente e e-mail não foi enviado; IA/cobrança não cobertas. |
| T39 | Todas as ações expostas na UI possuem backend, validação e retorno correto ou estado de indisponibilidade justificado. | Parcial local (MariaDB) | Backend real para recados, frequencia e gestao escolar; restante dos modulos ainda pendente. |
| T40 | Os dois contratos visuais são preservados nos seus escopos, com mudanças necessárias documentadas e comparação visual. | Parcial local (MariaDB) | Shells distintos implementados e mapeados; screenshot comparativo pendente. |
| T41 | Criar duas escolas adiciona linhas na mesma base/schema e não cria databases, schemas, tabelas ou instâncias de aplicação por tenant. | Parcial local (MariaDB) | `verify:m1` após M2: duas escolas no database `_dev`, 22 tabelas compartilhadas (inclui migration table), sem database por tenant. |
| T42 | Com dois tenants no mesmo MySQL, FKs compostas rejeitam matrícula/anexo/vínculo que conecte recursos de escolas diferentes. | Parcial local (MariaDB) | `verify:m1`: FK composta rejeitou matricula cross-tenant; MySQL 8 ainda nao testado. |
| T43 | Repositório tenant-scoped recusa contexto ausente; filtros com OR/spread e mass assignment não removem o tenant obrigatório. | Pendente | Sem implementacao/teste completo registrado. |
| T44 | Nested writes, connect/connectOrCreate, upsert, bulk operations, raw SQL e transações não escapam do isolamento. | Pendente | Sem implementacao/teste completo registrado. |
| T45 | Duas abas da mesma conta em escolas diferentes leem/gravam no contexto correto, mesmo após troca de seleção e respostas fora de ordem. | Pendente | Sem implementacao/teste completo registrado. |
| T46 | Não há currentTenant mutável global nem pool/PrismaClient criado por escola; limites de conexões são documentados por processo. | Pendente | Sem implementacao/teste completo registrado. |
| T47 | Count, agregações, buscas, facetas e cards do dashboard não revelam totais/conteúdo de outro tenant ou audiência restrita. | Parcial local (MariaDB) | Dashboard e repositorios filtram tenant; testes de contagens/audiencia permanecem pendentes. |
| T48 | Cache aquecido por família/professora da escola A não é reutilizado indevidamente na escola B ou por outro responsável da A. | Pendente | Sem implementacao/teste completo registrado. |
| T49 | Chave de storage, prefixo adulterado, thumbnail e URL direta não dão acesso sem a política de mídia apropriada. | Pendente | Sem implementacao/teste completo registrado. |
| T50 | Mesma chave de idempotência em tenants diferentes é independente; chave repetida com payload divergente no mesmo escopo gera conflito. | Pendente | Sem implementacao/teste completo registrado. |
| T51 | Onboarding repetido/concorrente não duplica tenant, escola, vínculo proprietário, contrato ou efeitos externos. | Parcial local (MariaDB) | `OnboardingProgress` tem chave única por tenant/etapa; smoke salva/restaura etapa. Criação concorrente de tenant/escola/contrato não coberta. |
| T52 | Restauração/exportação de um tenant em ambiente de ensaio não entrega dump global nem sobrescreve dados de outra escola. | Pendente | Sem implementacao/teste completo registrado. |
| T53 | Excluir/revogar Membership preserva a conta global e demais vínculos; a criança não muda de tenant por edição de payload. | Pendente | Sem implementacao/teste completo registrado. |
| T54 | Rede sem grants e SUPER_ADMIN sem concessão de conteúdo não acessam registros infantis ou álbuns privados. | Pendente | Sem implementacao/teste completo registrado. |
| T55 | Portal público só consulta projeção aprovada; login não é contornado por host/slug, chamada direta ou objeto SSR/RSC. | Parcial local (MariaDB) | `smoke:m1`: projecao publica minimizada e sem nome de estudante. |
| T56 | Tela de turma preserva cores, fontes, hero, navegação, cards, filtros, modais e rodapé do HTML com dados reais autorizados. | Parcial local (MariaDB) | Shell ludico conectado a dados permitidos; validacao visual de todos os componentes pendente. |
| T57 | Dashboard reproduz sidebar violeta, quatro cards, atualizações, ações rápidas e frequência, sem reutilizar a marca/dados demonstrativos. | Parcial local (MariaDB) | Shell violeta implementado; comparacao visual ainda nao executada. |
| T58 | Mudança de contexto atualiza título, filtros, indicadores e links; usuário sem turma tem estado vazio, não dados de uma turma arbitrária. | Pendente | Sem implementacao/teste completo registrado. |
| T59 | Nenhuma senha é exibida/retornada; quickLogin e credenciais admin/123 não funcionam em tenant real. | Parcial local (MariaDB) | Login real e sem quickLogin/senha no HTML; teste de credenciais antigas pendente. |
| T60 | Dados de negócio e arquivos persistem após reload/nova sessão porque estão no MySQL/storage; localStorage não é a base da aplicação. | Parcial local (MariaDB) | Smoke le dados persistidos em novas requisicoes; storage de arquivos nao existe ainda. |
| T61 | Mural busca apenas um lote no servidor, mostra Carregar mais lembranças e anexa a próxima página sem duplicação/rolagem perdida. | Pendente | Sem implementacao/teste completo registrado. |
| T62 | Cursor adulterado/de outro tenant/filtro não amplia acesso; nova publicação durante navegação respeita a estratégia de ordenação/snapshot. | Pendente | Sem implementacao/teste completo registrado. |
| T63 | Fila de aprovação usa páginas numeradas, total autorizado e filtros servidor; excluir/aprovar último item ajusta a página válida. | Pendente | Sem implementacao/teste completo registrado. |
| T64 | Minhas recordações guardadas usa páginas numeradas, mantém filtros ao retornar e nunca baixa todo o álbum para fatiá-lo. | Pendente | Sem implementacao/teste completo registrado. |
| T65 | Falha ao carregar mais preserva itens e permite retry; clique duplo e resposta obsoleta após trocar contexto não misturam resultados. | Pendente | Sem implementacao/teste completo registrado. |
| T66 | Foto inexistente usa placeholder neutro; nenhum aluno recebe a foto remota padrão de outra pessoa. | Pendente | Sem implementacao/teste completo registrado. |
| T67 | Fotos adicionadas exclui variantes e álbuns familiares reservados; sem aula/presença pendente não vira percentual falso. | Pendente | Sem implementacao/teste completo registrado. |
| T68 | Enviar para professoras cria submissão explicitamente; Guardar nas minhas recordações permanece privado por padrão. | Pendente | Sem implementacao/teste completo registrado. |
| T69 | Aprovar submissão não publica automaticamente; retirada, ajuste e reapresentação mantêm autoria/versão/audiência corretas. | Pendente | Sem implementacao/teste completo registrado. |
| T70 | Aprovação em lote valida cada item e informa falhas parciais sem ampliar silenciosamente visibilidade. | Pendente | Sem implementacao/teste completo registrado. |
| T71 | Rota privada, payload hidratado, metadata/OG, preview e indexação não expõem conteúdo infantil não publicado. | Pendente | Sem implementacao/teste completo registrado. |
| T72 | Migração de dados locais não herda senhas abertas nem confunde DEFAULT_STUDENTS com cadastros reais; importação requer confirmação. | Parcial local (MariaDB) | CSV requer prévia, dry-run e confirmação; não há migração de arrays demonstrativos nem herança de senha. |
| T73 | Virada de ano não copia consentimentos/equipe indiscriminadamente nem rompe URLs/portfólios do período anterior. | Parcial local (MariaDB) | Virada duplica só turmas selecionadas, exige escolha explícita de equipe e não copia consentimentos/conteúdo; URLs/portfólios ainda não existem/testados. |
| T74 | Configuração de branding não injeta JS/CSS arbitrário e não mistura tema, logotipo ou domínios entre escolas. | Pendente | Sem implementacao/teste completo registrado. |
| T75 | Remover/reassociar domínio exige controle verificado; host desconhecido não cai no primeiro tenant. | Pendente | Sem implementacao/teste completo registrado. |
| T76 | Drawer/sidebar, modais, galeria e frequência funcionam em mobile e teclado sem conteúdo cortado ou ações inacessíveis. | Pendente | Sem implementacao/teste completo registrado. |
| T77 | Cada ação rápida do dashboard abre/submete seu fluxo real com retorno, autorização, erro e atualização dos cards adequados. | Pendente | Sem implementacao/teste completo registrado. |
| T78 | Módulos comercializados como ativos possuem fluxos end-to-end; recurso de plano/configuração ausente é comunicado sem falso sucesso. | Pendente | Sem implementacao/teste completo registrado. |
| T79 | CI valida matriz de ownership de modelos/imports do cliente Prisma e impede regressão conhecida de isolamento do banco compartilhado. | Pendente | Sem implementacao/teste completo registrado. |
| T80 | Checklist final diferencia implementação, testes locais, sandbox, homologação e produção, incluindo evidências dos dois modelos visuais. | Parcial local (MariaDB) | `docs/execucao.md` discrimina implementado/local/sandbox/homologacao/producao. |
## Comandos e evidências

- `npm.cmd run verify:m1`: 22 tabelas InnoDB no database compartilhado local após M2, dois tenants e rejeição de enrollment cross-tenant.
- `npm.cmd run smoke:m1`: sessão/membership, dashboards nas duas escolas, projeção pública minimizada e vínculo familiar isolado.
- `npm.cmd run smoke:m2`: unidade, turma, capacidade/lista de espera, vínculo de equipe/família e tentativas cross-tenant negadas.
- `npm.cmd run smoke:m2:lifecycle`: prévia/dry-run CSV (inclui turma inválida), commit e retry idempotente; transferência/histórico e bloqueio cross-tenant; convite aceito uma vez; onboarding/calendário; bloqueio ao fechar ano com matrícula ativa; virada que preserva histórico e exige equipe explícita. Dados temporários limpos/restaurados no `finally`.
- `npx.cmd prisma migrate status`: três migrations no schema `_dev`, atualizado.
- `npm.cmd run typecheck` e `npm.cmd run build` passaram com os módulos M2 incluídos. ESLint focado nos arquivos alterados não terminou após 60 segundos e foi interrompido; lint não comprovado.

Consulte `docs/execucao.md` para ambiente, migration, limitações e próximo passo.
