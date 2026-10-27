# Execução e checkpoint

**Atualizado:** 27/10/2026 (America/Sao_Paulo). **M0:** concluído. **M1:** implementado e testado localmente em MariaDB. **M2:** parcialmente implementado e testado localmente em MariaDB; gate aberto.

## M0 — diagnóstico

- O workspace original era um kit, sem aplicação existente. A base apontada pelo `.env` foi inspecionada em modo somente leitura: MariaDB 10.10.7, InnoDB e zero tabelas. `.env` original e referências foram preservados; não havia dados de negócio a migrar.
- O mestre integral está em `docs/specs/turminha-saas.md`; HTML e dashboard foram copiados em `docs/referencias/` com hashes em `docs/referencias/README.md`. O mapa visual/funcional está em `docs/mapeamento-referencias.md`.
- Next.js gerou `AGENTS.md` no primeiro `next dev`; foi lido e mantido intacto.

## M1 — fundação e evidências

- Uma base compartilhada `turminha_saas_dev`, com 15 tabelas InnoDB, serve as duas escolas demonstrativas. Sessões são persistidas com token opaco e hash; Membership, role e tenant são revalidados no servidor. Constraints/FKs compostas evitam vínculos entre tenants.
- `/s/[escola]` e `/familia/[escola]` mantêm o contrato lúdico; `/app/[escola]/dashboard` mantém o dashboard de gestão violeta. Comunicado, presença e relatório diário usam dados persistidos.
- Seed local somente em development/test, loopback, `DEMO_SEED=true` e database `_dev`/`_test`. Cadastros são fictícios. A base original `turminha_saas` não recebeu migration ou seed.

## M2 — fatia de gestão escolar

- A migration `20261026220331_school_management_m2` adiciona `school_units`, relação de unidade por FK composta, e capacidade em `classrooms`.
- `/app/[escola]/gestao-escolar` permite atualizar nome e nome público da escola, criar unidade e turma/ano/capacidade, matricular estudante (matrícula ativa até a capacidade; depois lista de espera), atribuir equipe existente e criar vínculo familiar pendente de confirmação.
- `/api/app/[escola]/gestao-escolar` verifica Origin, sessão, papel SCHOOL_ADMIN/COORDINATOR, tenant e associações antes de cada gravação. Um tenant admin não opera no outro.
- Seed fictício inclui um vínculo SCHOOL_ADMIN na escola A para exercitar a gestão sem credenciais reais.
- A migration `20261027153526_m2_onboarding_import_calendar` adiciona fontes externas de alunos, anos letivos, eventos de calendário, convites, lotes de importação, etapas de onboarding e trilha de transferências, sempre com `tenantId` e FKs compostas para relações tenant-scoped.
- `/app/[escola]/gestao-escolar/convites` gera convites com token aleatório de uso único (somente hash persistido), validade de sete dias, vínculo a criança/turma e revogação. `/convite/[token]` aceita criação/associação da conta e vincula responsável/equipe após validar papel, tenant e senha existente. O e-mail não é enviado: o link é apresentado para compartilhamento manual, pois SMTP não está configurado.
- `/app/[escola]/gestao-escolar/importar` baixa um modelo CSV, envia até 1 MB/500 linhas para prévia em memória, mostra/corrige campos, executa dry-run e bloqueia commit inválido. A confirmação é uma transação serializável e idempotente por hash/lote; capacidade excedente vira lista de espera. Convites gerados retornam links uma única vez, identificados por nome/e-mail/papel. CSV bruto e tokens não são persistidos. Não há e-mail, desfazer pós-commit ou armazenamento de arquivos neste fluxo.
- `/app/[escola]/calendario` cria e encerra anos letivos e adiciona/arquiva feriados, recessos, períodos e eventos dentro das datas do ano. A virada transacional encerra matrículas e turmas de origem, copia apenas turmas selecionadas, pede seleção explícita de equipe e, se marcado, transfere as matrículas mantendo status de lista de espera/capacidade e trilha de origem/destino. Vínculos familiares continuam associados ao cadastro da criança; consentimentos, avisos, mídia e outros conteúdos não são copiados. Encerramento simples é bloqueado enquanto houver matrícula aberta. `/api/.../transferencias` também move matrícula entre turmas da mesma escola e recusa turma cross-tenant.
- `/app/[escola]/gestao-escolar/onboarding` infere marcos a partir de registros do tenant e salva/reabre etapas manuais em `OnboardingProgress`, permitindo retomar o checklist. Ainda não cria sozinho a escola ou os recursos de cada etapa.
- `npm.cmd run smoke:m2:lifecycle` cobriu preview, dry-run válido/inválido, commit, retry idempotente, transferência e histórico, alvo cross-tenant negado, criação/aceitação/replay recusado de convite, persistência de etapa, ano/evento, renderização de virada, bloqueio de encerramento inseguro e virada com equipe selecionada/histórico preservado. Dados temporários são removidos e o estado prévio de onboarding é restaurado. Não cobre convite expirado/revogado ou concorrência real.
- M2 continua aberto: testes de expiração/revogação e titularidade de convite, rate limit, matrizes amplas de escopo, cenários concorrentes/adversariais, experiência integral de primeiro uso e homologação em MySQL 8. E-mail transacional é dependência externa ainda não configurada. Não declarar o gate aprovado.

## Ambiente e comandos executados

Node 22.18.0, npm 10.9.3, Prisma 7.10.1, Next.js 16.4.3. Usei `.env.local` e o `DATABASE_URL` configurado, sem exibir credenciais. O servidor efetivamente respondeu **MariaDB 10.10.7**, InnoDB, database `turminha_saas_dev`; apesar do nome do conector/URL MySQL, isso não comprova execução no MySQL 8. Docker não está instalado. Não substituí a base pela stack Compose.

| Comando/fluxo | Resultado |
|---|---|
| `npm.cmd run db:inspect` | Passou após corrigir serialização BigInt; confirmou `turminha_saas_dev`, MariaDB 10.10.7, 15 tabelas no schema (14 do app e `_prisma_migrations`) e engines InnoDB. |
| `npx prisma migrate status` antes de M2 | Passou; migration M1 aplicada e schema em dia. |
| `npm.cmd run db:seed` | Passou após M2; escolas A/B com 3/2 estudantes, unidade demonstrativa e admin fictício A. Uma execução anterior falhou por ID fixo acima do limite de 30 caracteres; o ID foi encurtado e a repetição passou. |
| `prisma migrate dev --name school_management_m2` | Passou; aplicou migration M2 incremental na base `_dev`, sem reset. |
| `npm.cmd run verify:m1` | Passou após a migration adicional: 22 tabelas no schema InnoDB compartilhado, escolas na mesma base, FK composta rejeitou escrita cross-tenant. |
| `npm.cmd run smoke:m1` | Passou: sessão, dashboards, projeção pública minimizada e escopo familiar. |
| `npm.cmd run smoke:m2` | Passou: configuração, unidade/turma, matrícula ativa/lista de espera, equipe e vínculo familiar; tentativas de unidade/equipe/contexto cross-tenant negadas. Dados temporários do smoke são removidos no `finally`. |
| `npm.cmd run smoke:m2:lifecycle` | Passou em MariaDB 10.10.7: CSV preview/dry-run, classe inexistente identificada, commit e retry idempotente; transferência/histórico e destino cross-tenant negado; convite aceito e replay recusado; onboarding retomável; ano e evento dentro do intervalo. Limpeza no `finally`; sem MySQL 8 ou sandbox. |
| `npx.cmd prisma migrate status` | Passou: 3 migrations encontradas, schema `_dev` em dia. |
| `npm.cmd run typecheck` | Passou após corrigir transformação de `unitId` vazio e compilar o fluxo CSV e os smokes. |
| `npm.cmd run build` | Passou após as rotas de importação, convites/aceitação, calendário, transferências e onboarding entrarem no build. |
| ESLint focado | A execução nos arquivos M2 não terminou em 60 segundos e não produziu saída; foi interrompida. Lint não validado nesta etapa. |

Erros corrigidos durante a execução: serialização de BigInt no inspetor; ID demasiado longo no seed; valor vazio de unidade no schema da API. Uma tentativa de `migrate status` depois da migration M2 ficou sem saída e foi interrompida; `migrate dev` informou que aplicou a migration e os smokes/verificação de banco passaram em seguida. O ensaio foi restrito ao banco local de desenvolvimento.

## Estado de entrega

- **Implementado:** fatia M1 e fatia inicial M2 acima.
- **Testado localmente:** MariaDB/InnoDB, validações de schema/constraints, M1/M2 smoke, typecheck e build.
- **Validado em sandbox:** não realizado.
- **Homologado:** não realizado.
- **Publicado em produção:** não realizado.
- Os 80 cenários permanecem requisitos. A matriz em `docs/matriz-requisitos.md` marca evidência parcial sem declarar aceite integral. Storage, filas, notificações, IA, billing, exportações, moderação e paginação de mídias ainda não estão concluídos.

## Próximo passo exato

Adicionar testes de expiração/revogação/titularidade dos convites e concorrência da importação/virada; aplicar rate limit; ampliar onboarding até o primeiro registro real; adicionar smokes de isolamento e executar em MySQL 8.4 limpo antes de avaliar o gate M2. SMTP permanece dependência externa; nenhum envio foi simulado. Até aqui, a base de teste foi MariaDB 10.10.7 em `turminha_saas_dev`.
