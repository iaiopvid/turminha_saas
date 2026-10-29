# ADR 0001 — uma base compartilhada por ambiente

- **Estado:** aceita em 26/10/2026; banco-alvo esclarecido em 28/10/2026.
- **Decisão:** MariaDB 10.10.7/InnoDB compartilhado; mesmas tabelas atendem escolas de um ambiente. `tenantId`, autorização do servidor e FKs compostas isolam registros.
- **Consequência:** onboarding cria linhas/configuração/vínculos; nunca banco/schema/tabelas/PrismaClient por escola. Migrations rodam por release em cada ambiente.
- **Alternativas rejeitadas:** database/schema dedicado, SQLite local como banco de negócio e tenantId vindo do cliente como autoridade.
- **Execução local:** a base original `.env` foi inspecionada em modo somente leitura (MariaDB 10.10.7, InnoDB, zero tabelas) e mantida intacta. A migration M1 foi aplicada somente à base separada `turminha_saas_dev`.
- **Banco-alvo:** MariaDB 10.10.7/InnoDB. Esta decisão substitui referências anteriores a MySQL na especificação. Prisma mantém `provider = "mysql"` e URLs `mysql://` por serem o dialeto/protocolo do conector; isso não altera o servidor MariaDB.
