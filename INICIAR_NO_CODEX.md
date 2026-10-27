# Instrução para iniciar o Turminha SaaS no Codex

Leia integralmente `TURMINHA_SAAS_PROMPT_MESTRE_V2.md` e utilize-o como especificação principal de implementação. Esta versão substitui a anterior e contém o escopo completo; não entregue somente um MVP ou um protótipo visual.

Inspecione o repositório e leia as instruções `AGENTS.md` aplicáveis antes de alterar código. Preserve alterações locais, dados e funcionalidades válidas. Se não houver aplicação existente, inicialize-a na stack obrigatória, sem inventar uma migração de dados.

Abra e analise as duas referências disponíveis no kit:

- `referencias/mundo_m_gico_do_maternal_i.html`: referência visual e funcional da área da turma e da família.
- `referencias/dashboard-admin.png`: referência visual das áreas administrativas e do painel da professora.

Não misture os layouts: preserve o mundo lúdico do HTML na turma/família e utilize a sidebar violeta, cards claros, atualizações, ações rápidas e frequência da imagem na gestão. A marca é Turminha; dados e pessoas demonstrativos não são cadastros reais.

A arquitetura está definida: Next.js fullstack com App Router, TypeScript, Tailwind CSS, shadcn/ui quando apropriado, MySQL/InnoDB e Prisma ORM. Todos os tenants/escolas compartilham uma única base de negócio e as mesmas tabelas por ambiente, com segregação por `tenantId`. Não criar banco, schema, tabelas, instalação ou conexão dedicada por tenant.

O modelo é conceitualmente semelhante ao DeliveryFood e VitaMulher. Isso não autoriza compartilhar os bancos ou dados desses produtos. Só consulte seus códigos se estiverem efetivamente disponíveis e autorizados no workspace.

O servidor deve resolver e validar tenant, identidade, vínculo, papel e escopo. Implemente repositórios tenant-scoped, FKs compostas, autorização por recurso e isolamento em arquivos, cache, filas, notificações, IA e exportações. Um tenantId enviado pelo frontend não é autorização.

Substitua login demonstrativo, senhas expostas, arrays fixos e persistência de negócio em localStorage por autenticação, banco e storage reais. Preserve o visual, não as limitações e inseguranças do protótipo.

Implemente todos os módulos e critérios do arquivo mestre em marcos verticais: banco, regras, autorização, backend, interface, testes e documentação. Mantenha o mural com “Carregar mais lembranças” e as telas de aprovação dos envios familiares e “Minhas recordações guardadas” com páginas numeradas, sempre paginadas no servidor.

Copie a especificação para `docs/specs/turminha-saas.md`, preserve as referências em `docs/referencias/` e mantenha `docs/execucao.md` e a matriz de requisitos atualizados. Não sobrescreva AGENTS.md nem coloque o documento inteiro nele.

Comece pelo M0 e avance para o M1. A primeira fatia deve demonstrar duas escolas no mesmo MySQL/schema, autenticação com vínculos, contexto de tenant validado e dados persistidos apresentados nos dois layouts. Continue os marcos conforme as condições da sessão; não pare apenas no planejamento.

Não execute cobrança real, disparos em massa, alteração de DNS, deploy em produção ou migração destrutiva sem autorização específica. Não deixe agentes/processos temporários executando indefinidamente.

Ao encerrar, registre o que foi implementado, arquivos/migrações relevantes, comandos e testes realmente executados, resultados, falhas, dependências externas e próximo passo exato. Diferencie implementado, testado localmente, validado em sandbox, homologado e publicado em produção. Os 80 cenários de aceite são requisitos a implementar e comprovar, não resultados já obtidos.

Comece pela inspeção das referências e do repositório e avance para a implementação.
