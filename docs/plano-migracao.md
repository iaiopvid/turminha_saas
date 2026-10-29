# Plano de migração e evolução

## Estado de origem

Não existe aplicação nem conteúdo local de negócio no workspace. O HTML e arrays `DEFAULT_*` são material demonstrativo; não serão convertidos em alunos, contas, arquivos ou consentimentos. Nenhuma migração de dados foi inventada.

## Proteção da base configurada

O `.env` aponta para uma base MariaDB 10.10.7 local chamada `turminha_saas`, ainda sem inventário confirmado. Antes de alterar schema, executar `npm run db:inspect` em modo somente leitura para versão, tabelas, engines, contagens aproximadas e migrações já existentes. Se houver objetos/dados de origem não reconhecida, interromper somente a operação de schema e registrar backup/dry-run/mapeamento após confirmação; manter o restante do desenvolvimento numa base nova de desenvolvimento explicitamente configurada.

## Caminho incremental

1. Criar/revisar base de desenvolvimento compartilhada com dois tenants; não criar banco/schema por tenant. Manter `.env` existente intacto.
2. Validar inventário e destino vazio/sanitizado; salvar cópia e checksum antes de mudança estrutural quando houver dados. Nunca executar reset/drop/seed global em base desconhecida.
3. M1: criar tabelas com `tenantId`, índices e FKs compostas. Migration aditiva e revisável; schema de todos os tenants evolui uma vez por ambiente.
4. Seed idempotente apenas em banco de desenvolvimento explicitamente autorizado, com tenants, usuários e alunos fictícios.
5. Em futura origem single-tenant real: backup verificado → dry-run → mapeamento de IDs e owner → preenchimento de tenant validado → conferência de contagens/órfãos/arquivos/vínculos → constraints → cutover controlado com recuperação. Preservar URLs quando houver URLs reais.

Não há sistema legado identificado para importação ou plano de recuperação de registros reais. Importação do navegador, caso venha a existir dado legítimo no futuro, será opt-in, com preview e confirmação do tenant; senhas abertas nunca migram.
