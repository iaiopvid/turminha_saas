# Turminha SaaS

Aplicacao full-stack multi-tenant para educacao infantil. Stack: Next.js App Router, TypeScript, Tailwind CSS, MySQL/InnoDB e Prisma ORM. Todas as escolas compartilham o schema por ambiente; o servidor valida sessao, tenant, membership, papel e escopo.

## Estado do projeto

O workspace comecou como kit de especificacao, sem aplicacao existente. M1 e uma fatia inicial de M2 foram implementados e testados localmente em MariaDB 10.10.7. Consulte o [checkpoint](docs/execucao.md), a [matriz de aceite](docs/matriz-requisitos.md) e a [especificacao mestre](docs/specs/turminha-saas.md). A validacao exata em MySQL 8 ainda esta pendente.

## Desenvolvimento

Requisitos: Node.js 22, npm e MySQL 8/InnoDB para validacao compativel com producao. O compose local e preparado em `compose.yaml`, mas ainda nao foi executado porque Docker nao esta disponivel nesta sessao. Para usar esses servicos, revise os valores locais de `.env.local.example` e mantenha segredos fora do controle de versao. Nao substitua o `.env` existente sem necessidade.

Com Docker instalado e credenciais locais revistas:

```powershell
docker compose up -d mysql redis storage mailpit clamav
if (!(Test-Path .env.local)) { Copy-Item .env.local.example .env.local }
npm install
npm run db:inspect
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Antes de migration ou seed, confirme que `DATABASE_URL` aponta para o banco de desenvolvimento `turminha_saas_dev`. O script de seed valida ambiente, flag `DEMO_SEED=true`, senha local e sufixo `_dev`/`_test`. Nunca aponte para producao. Os comandos de smoke e integridade sao `npm run smoke:m1`, `npm run verify:m1` e `npm run smoke:m2`.

## Dependencias ainda nao integradas

Compose local tem servicos previstos para MySQL, Redis, S3 compativel (RustFS), SMTP de teste (Mailpit) e ClamAV. Isso nao significa que adapters estejam conectados ao app. Filas, armazenamento seguro, antivírus, SMTP, IA e Asaas continuam pendentes e nao simulam sucesso real.
