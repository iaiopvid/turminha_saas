# Ownership e tenancy

Topologia: um MariaDB 10.10.7/schema compartilhado por ambiente. Todos os modelos abaixo são tenant-owned e carregam `tenantId`; `User` e `Session` são identidade global e não autorizam acesso a dado escolar sem vínculo ativo.

| Modelo / tabela | Owner / fronteira | Proteção implementada em M1 | Estado |
|---|---|---|---|
| Tenant / `tenants` | Raiz do tenant | slug global; status consultado no contexto | Implementado |
| School / `schools` | `tenantId` | unique tenant e FK tenant | Implementado |
| Membership / `memberships` | `tenantId`, `userId` global | vínculo único por tenant/usuário; status e papel verificados | Implementado |
| Classroom / `classrooms` | `tenantId` | chaves e índices tenant-scoped | Implementado |
| ClassroomStaff / `classroom_staff` | `tenantId`, turma e membership | FKs compostas exigem turma e membership do mesmo tenant | Implementado |
| Student / `students` | `tenantId` | consultas repository filtradas; perfil público desligado por padrão | Implementado |
| Enrollment / `enrollments` | `tenantId`, estudante e turma | FKs compostas; tentativa cross-tenant rejeitada em MariaDB local | Implementado |
| StudentGuardian / `student_guardians` | `tenantId`, estudante e membership guardião | FKs compostas; aprovação/vínculo consultados | Implementado |
| Attendance / `attendance` | `tenantId`, enrollment e membership recorder | FKs compostas e unique por enrollment/data | Implementado |
| Announcement / `announcements` | `tenantId`, turma opcional | FK composta de turma; repos tenant-scoped | Implementado |
| MediaAsset / `media_assets` | `tenantId`, turma opcional | FK composta, status/index; ownership de objeto ainda sem adaptador | Parcial |
| User / `users` | Identidade global | Sem dados escolares diretos; email único global | Implementado |
| Session / `sessions` | User global | Token aleatório; somente hash armazenado; expiração/revogação consultadas | Implementado |

Não existem ainda outbox, jobs, notificações, exportações, armazenamento de objeto ou consumo escolar no schema. Ao introduzi-los, devem carregar owner tenant explícito e FKs/constraints adequadas. Não presumir que um `tenantId` do frontend concede autorização. Cache, filas, object storage, IA e exportações ainda não foram implementados e, por isso, não têm prova de isolamento.

## Contexto

`resolveTenantContext` deriva o user da sessão persistida, valida tenant ativo e membership ativa e retorna o papel; os repositórios recebem esse contexto. Papel docente também restringe turmas atribuídas. Autorização granular por ação/recurso e validação para todos os futuros endpoints continuam pendentes.


## Dominios personalizados (T75)

`TenantDomain` vive no schema de negocio compartilhado e tem hostname unico global e `tenantId`. Administracao escolar cria o registro pendente e publica o TXT `turminha-domain-verification=<token>` no nome exato; somente a correspondencia TXT transforma o registro em VERIFIED. Remocao tambem exige resolver o mesmo TXT. Nao ha acao para tomar ou reassociar dominio ocupado; a escola proprietaria precisa remover com nova prova antes de outra poder cadastrar.

A aplicacao le o header HTTP `Host` normalizado (nao usa `X-Forwarded-Host` para decidir tenant). O host base configurado e loopback ficam disponiveis para acesso por slug. Host customizado desconhecido ou pendente retorna 404; host verificado seleciona somente seu tenant na raiz e bloqueia slug/API de outra escola. Contexto autenticado continua exigindo membership ativa.

A prova DNS e o roteamento da aplicacao foram exercitados localmente; DNS publico, configuracao de proxy/DNS do provedor e TLS/certificado ainda dependem de infraestrutura externa e nao foram homologados.
