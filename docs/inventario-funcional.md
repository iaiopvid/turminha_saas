# Inventário funcional — baseline

Como não há aplicação, todos os módulos estão **ausentes no workspace**. O HTML de referência é uma demonstração isolada; não foi importado como cadastro. “Funcional no original” indica apenas comportamento do arquivo local, não fluxo de produção.

| Capacidade | Estado no workspace | Referência/observação | Implementação prevista |
|---|---|---|---|
| Portal comercial e páginas legais | Ausente | Não representado no HTML | Rotas comerciais; textos legais em rascunho/revisão |
| Identidade/sessões/membership | Ausente | Login local e quickLogin inseguros | Sessão HttpOnly assinada, User global, Membership e verificação por tenant |
| Escola/unidade/ano/turma | Parcial local | Gestão escolar cria escola/unidades/turmas e `/app/[escola]/turma` lista matrículas ativas com escopo e paginação | Completar edição de turma, perfis e experiência lúdica pública/privada |
| Início/mural “Mundo Mágico” | Demo no HTML | Mural/cantinho, destaques editoriais e confete | Dados persistidos e projeções por audiência |
| Nossa Turma/perfil | Demo no HTML | Cards e modal de citação/foto | Publicação explicitamente autorizada; sem cadastro público por padrão |
| Galeria/filtros/lightbox | Demo no HTML | Todas/Atividades/Brincadeiras/Festas | Busca paginada e mídia segura; lightbox acessível |
| Equipe/Titias | Demo no HTML | Carta, dicas e nomes Lane/Helen | Conteúdo configurável por escola, identidades não presumidas |
| Área familiar | Demo no HTML | Upload por FileReader, álbum em localStorage | Adulto com vínculo; escolha guardar privado ou enviar à escola |
| Gestão de envios | Ausente | Painel antigo não é referência de admin | Fila de aprovação em páginas numeradas |
| Dashboard docente | Ausente | Layout obrigatório é PNG administrativo | Sidebar violeta, quatro cards, atualizações, ações reais e frequência |
| Gestão escolar, pedagogia e rotina | M2 parcial; M3 iniciado | Gestão escolar, calendário, importação, convites, transferências e onboarding parciais; turma, diário interno com execução ligada opcionalmente a plano aprovado, observações individuais, evidências privadas com storage S3/local configurável e planejamento pedagógico versionado | Validar upload/download local e varredura; implementar autorização parental antes de qualquer compartilhamento, BNCC oficial verificada, relatórios e demais rotinas |
| Comunicação/calendário/autorizações | Ausente | Escopo novo | Marco de comunicação após fluxos centrais |
| Relatórios, exportações, livro | Ausente | Escopo novo | Jobs e autorização antes de entrega |
| Billing, operação SaaS, suporte | Ausente | Escopo novo | Sandbox primeiro; nenhuma cobrança real |
| IA assistiva | Ausente | Escopo novo | Opt-in, adaptador e revisão; sem fatos não sustentados |
| Arquivos/storage, Redis/e-mail | Ausente | Sem configuração de serviços | Adaptadores privados e indisponibilidade explícita |
| PWA, acessibilidade, observabilidade | Ausente | Sem aplicação/checks | Implementar e validar por marco |

Dados de demonstração do HTML, fotos externas e nomes em listas são conteúdo do protótipo; nenhuma migração é necessária ou presumida. M1 está implementado em fatias locais; M2 contém os fluxos parciais descritos em `docs/execucao.md`. O seed usa cadastros fictícios e é bloqueado fora de desenvolvimento/teste e banco `_dev`/`_test`.
