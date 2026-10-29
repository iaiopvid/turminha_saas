# Diagnóstico do repositório — baseline M0

**Data da inspeção:** 26/10/2026 (America/Sao_Paulo). **Resultado:** kit de briefing, sem aplicação.

## Fontes e estado local

- Diretório do projeto não contém `.git`, `package.json`, lockfile, código de aplicação, rotas, autenticação, schema/migrations Prisma, testes ou configuração de deploy. Não havia `AGENTS.md` aplicável no diretório nem nos ancestrais examinados.
- O `LEIA-ME.md` e o inventário do ZIP confirmam que o kit contém apenas a especificação e as duas referências. DeliveryFood/VitaMulher não foram consultados; seus repositórios não estão neste workspace.
- Existe `.env` local com `DATABASE_URL` para `mysql://…@localhost:3306/turminha_saas`. Segredo não foi exibido. TCP local responde. A existência/conteúdo das tabelas ainda precisa ser inventariada em modo somente leitura antes de qualquer migration/seed.
- Runtime detectado: Node.js 22.18.0, npm 10.9.3. Docker e clientes CLI MariaDB 10.10.7 não estão disponíveis no PATH. O servidor MariaDB 10.10.7 local está acessível pela porta configurada.
- Não há dados ou funcionalidades da aplicação no workspace a migrar. Isso não autoriza apagar ou recriar a base configurada em `.env`.

## Referências examinadas

- HTML `referencias/mundo_m_gico_do_maternal_i.html`: 1.296 linhas, UTF-8, SHA-256 `8838d7f576c2af61290e7f5cf0dc3754bd908a230900d14faa181f01fc5b4c72`. Fonte lida; áreas: início/mural, turma e modal de perfil, galeria e lightbox, Titias, login demonstrativo, painel familiar/upload e painel administrativo. Tokens visuais, estrutura de navegação, formulários, estados e funções JavaScript foram inventariados. Usa Tailwind/Font Awesome/Confetti via CDN, localStorage, FileReader em data URL, `innerHTML`, fotos remotas e credenciais demonstrativas abertas; estes itens são referências de comportamento/risco, não base para runtime.
- `referencias/dashboard-admin.png`: aberta e inspecionada a 1536×1024, SHA-256 `b3a53d892c7afcbc51eb1f807af9678dad581d181e6ec73ca5915ed7abc0d9e8`. Mostra sidebar violeta, quatro métricas, atualizações, ações rápidas e frequência.
- Cópias e hashes preservados em `docs/referencias/`. Browser local não foi validado: a automação visual encerrou quando não conseguiu determinar com confiança a URL da janela previamente aberta. Não se afirma screenshot renderizado do HTML.

## Baseline técnico

Não havia scripts de projeto para executar. Nenhum teste/build/lint anterior existe. M0 foi fechado após inspeção da base e registro do mapa visual-funcional. As migrations seguem apenas na base de desenvolvimento compartilhada.

## Atualização após M1

A inspeção somente leitura foi concluída: a base apontada pelo `.env` original tinha MariaDB 10.10.7, InnoDB e nenhuma tabela. Esse `.env` não foi modificado. A migração e o seed foram executados somente em `turminha_saas_dev`, uma base separada de desenvolvimento compartilhado. O servidor detectado é MariaDB 10.10.7; por decisão de 28/10/2026, essa é a versão-alvo e não existe gate de outro produto de banco. Docker não estava disponível na inspeção inicial. No primeiro `next dev`, Next.js gerou `AGENTS.md`; as instruções foram lidas e o arquivo mantido intacto.

## Riscos e decisões

## Atualização M2 — 26/10/2026

M2 adicionou gestão de escola/unidade/turmas, capacidade e matrícula na base de desenvolvimento compartilhada. O smoke validou escopo e lista de espera. Importação CSV, convites, calendário e transferência seguem pendentes. A conexão configurada foi confirmada como MariaDB 10.10.7; esta versão está definida como alvo.

1. O `.env` existente pode apontar para uma base com dados de outro projeto; inventariar somente leitura e não redefinir a conexão.
2. Credenciais Lane/Helen reais não foram fornecidas. O seed usará pessoas explicitamente fictícias, sem endereços de e-mail ou fotos verdadeiras.
3. O desenho do HTML não comprova consentimento para expor nomes ou rostos. Projeção pública de crianças começa desligada.
4. Instalação da stack depende do npm; infraestrutura local não tem Docker e usa a conexão MariaDB 10.10.7 existente.

## Atualizacao depois de M2 — 26/10/2026

M2 adicionou gestao de escola/unidade/turmas, capacidade e matricula na base de desenvolvimento compartilhada. O smoke validou escopo e lista de espera. Importacao CSV, convites, calendario e transferencia seguem pendentes. A conexao configurada respondeu MariaDB 10.10.7; esta versao esta definida como alvo.
