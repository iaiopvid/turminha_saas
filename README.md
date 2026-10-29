# Turminha SaaS

Aplicacao full-stack multi-tenant para educacao infantil. Stack: Next.js App Router, TypeScript, Tailwind CSS, MariaDB 10.10.7/InnoDB e Prisma ORM. Todas as escolas compartilham a mesma base e as mesmas tabelas por ambiente; o servidor valida sessao, tenant, membership, papel e escopo.

## Estado do projeto

O workspace comecou como kit de especificacao, sem aplicacao existente. M1 e fatias de M2 foram implementados e testados localmente em MariaDB 10.10.7; M3 foi iniciado com lista de turma, diário interno, planejamento pedagógico e configurações escolares. Consulte o [checkpoint](docs/execucao.md), a [matriz de aceite](docs/matriz-requisitos.md) e a [especificacao mestre](docs/specs/turminha-saas.md). MariaDB 10.10.7/InnoDB e o banco-alvo definido para este projeto.

## Desenvolvimento

Requisitos: Node.js 22, npm e MariaDB 10.10.7/InnoDB. O Compose local define MariaDB na porta 3306; nao foi iniciado nesta sessao porque Docker nao esta disponivel. `provider = "mysql"` no Prisma e `mysql://` em `DATABASE_URL` sao identificadores tecnicos do dialeto/protocolo usados pelo adaptador MariaDB. Para usar os servicos locais, revise `.env.local.example` e mantenha segredos fora do controle de versao. Nao substitua o `.env` existente sem necessidade.

Com Docker instalado e credenciais locais revistas:

```powershell
docker compose up -d mariadb redis storage mailpit clamav
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

Compose local define MariaDB 10.10.7, Redis, S3 compativel (RustFS), SMTP de teste (Mailpit) e ClamAV. A definicao nao significa que os servicos tenham sido iniciados ou que os adapters estejam conectados ao app. Consulte o checkpoint para o estado de cada fluxo.
