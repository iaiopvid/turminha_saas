# ADR 0001 — uma base compartilhada por ambiente

- **Estado:** aceita em 26/10/2026.
- **Decisão:** MySQL/InnoDB compartilhado; mesmas tabelas atendem escolas de um ambiente. `tenantId`, autorização do servidor e FKs compostas isolam registros.
- **Consequência:** onboarding cria linhas/configuração/vínculos; nunca banco/schema/tabelas/PrismaClient por escola. Migrations rodam por release em cada ambiente.
- **Alternativas rejeitadas:** database/schema dedicado, SQLite local como banco de negócio e tenantId vindo do cliente como autoridade.
- **Execução local:** a base original `.env` foi inspecionada em modo somente leitura (MariaDB 10.10.7, InnoDB, zero tabelas) e mantida intacta. A migration M1 foi aplicada somente à base separada `turminha_saas_dev`.
- **Validação pendente:** testar no MySQL 8/InnoDB. A infraestrutura compose foi preparada, mas Docker não está instalado na sessão atual.
