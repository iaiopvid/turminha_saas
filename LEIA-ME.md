# Turminha SaaS — kit de especificação para Codex | versão 2.0

Este kit contém o prompt mestre completo e as referências fornecidas pelo proprietário. Não contém a aplicação implementada e não representa um deploy. A especificação consolida o escopo anterior, a decisão de banco único multi-tenant e os dois modelos visuais.

## Conteúdo

| Arquivo | Uso |
|---|---|
| `TURMINHA_SAAS_PROMPT_MESTRE_V2.md` | Documento principal, integral e autossuficiente: arquitetura, módulos, UI, segurança, operação e aceite. |
| `TURMINHA_SAAS_PROMPT_MESTRE_V2.txt` | Mesmo conteúdo em arquivo de texto UTF-8. |
| `INICIAR_NO_CODEX.md` | Mensagem de abertura para colar no Codex, apontando para a especificação e as referências. |
| `referencias/mundo_m_gico_do_maternal_i.html` | HTML original da área da turma/família, preservado sem alterações. |
| `referencias/dashboard-admin.png` | Imagem original do dashboard administrativo, renomeada de `image.png`, sem alteração dos bytes. |
| `manifesto-referencias.json` | Identificação, dimensões/linhas e hashes das referências para conferência. |

## Como utilizar

Extraia o kit para uma pasta dentro do workspace do projeto, por exemplo `docs/briefing-turminha-v2/`, sem sobrescrever arquivos de código. Abra o repositório no Codex e envie o conteúdo de `INICIAR_NO_CODEX.md`, informando o caminho da pasta se necessário. O agente deve ler o arquivo mestre por inteiro, abrir o HTML e inspecionar a imagem, além de seguir o AGENTS.md aplicável.

O arquivo mestre substitui a versão anterior como contrato de implementação. Não é necessário anexar a v1. Não cole a especificação inteira no AGENTS.md: mantenha nela apenas uma referência curta, se precisar, preservando instruções existentes.

## Decisões fechadas

A stack é Next.js fullstack/App Router, TypeScript, Tailwind, shadcn/ui quando útil, MariaDB 10.10.7/InnoDB e Prisma. Uma base de negócio e as mesmas tabelas atendem todos os tenants de cada ambiente; o isolamento usa tenantId, vínculo, políticas e constraints. Não existe banco por escola nesta etapa. `provider = "mysql"` e `mysql://` são os identificadores exigidos pelo Prisma/adapter MariaDB, não indicam servidor MySQL. Separar ambientes de desenvolvimento, demonstração, homologação e produção continua necessário.

DeliveryFood e VitaMulher são referências do modelo SaaS, não autorização para compartilhar seus bancos, dados, usuários ou código indisponível. Cada escola é um tenant e pode ter unidades/turmas. Contas adultas possuem vínculos; crianças e acervos escolares permanecem locais ao tenant.

Turma/família seguem a identidade do HTML. Administração segue a composição da imagem. A reprodução deve ser em componentes reais, não iframe/screenshot, com dados persistidos e fluxos autenticados.

## Organização da entrega

O documento possui 28 seções numeradas (0 a 27), 12 marcos (M0 a M11) e 80 cenários mínimos de aceite (T01 a T80). Esses cenários são exigências para a implementação futura, não testes de uma aplicação já executados neste kit.

O núcleo web, módulos comerciais, pedagogia, memórias e IA permanecem no escopo. API/redes, financeiro escolar opcional, impressão comercial e aplicativo Flutter estão identificados nos marcos de expansão; não podem ser anunciados como implementados enquanto estiverem pendentes.

A implantação em produção depende também de credenciais, domínio, gateway, infraestrutura, validação pedagógica/jurídica e homologação. O Codex deve registrar as dependências reais, sem inventar resultados, certificações ou operações.

## Sobre as referências

O HTML é demonstrativo: usa localStorage, login simulado e senhas em texto. É fonte de design/fluxo, não implementação segura. As fotografias e qualificações presentes nas referências não devem ser tratadas como identificação ou credenciais reais. A imagem orienta o dashboard; sua marca/rostos/mascote não devem ser recortados e utilizados como assets de produção.

As fontes técnicas e normativas ficam na seção 27 do arquivo mestre. Requisitos de produto são diferenciados do que efetivamente existe no HTML. O conteúdo dos arquivos é UTF-8.
