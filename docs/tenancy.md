# Ownership e tenancy

Topologia: um MySQL/schema compartilhado por ambiente. Todos os modelos abaixo são tenant-owned e carregam `tenantId`; `User` e `Session` são identidade global e não autorizam acesso a dado escolar sem vínculo ativo.

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
