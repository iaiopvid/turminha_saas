# Mapeamento das referências para fluxos

| Origem | Componente/rota | Operação de backend | Permissão | Teste/evidência |
|---|---|---|---|---|
| `tab-home`: hero e navegação | `/s/[escola]` `ClassroomExperienceLayout` | Ler branding configurado e projeção publicada do mural | Projeção pública; conteúdo interno exige sessão/contexto | T40/T56; comparação visual |
| Mural e “Nosso Cantinho” | Início da turma | Consultar anúncio e contagens escopadas/paginadas | Publicação vigente/audiência; administração escolar para editar | T47/T56 |
| “Artes & Cores”, “Cantigas & Rodas”, “Jogos Lúdicos” | Destaques editoriais | Ler tema/configuração da escola | Público apenas quando habilitado | T56 |
| `tab-turma`, cards e modal | Nossa Turma / perfil | Projeção de aluno autorizada, por turma | Consentimento/audiência; campos minimizados | T12/T55/T56/T66 |
| `tab-galeria`, categorias e lightbox | Galeria, `MemoryCard`, lightbox | Consulta por cursor, mídia servida com autorização | Publicação e sujeitos elegíveis | T12/T49/T61/T62/T76 |
| `tab-titias`, carta/dicas | Equipe | Conteúdo editorial configurável | Exibição por configuração; edição equipe autorizada | T40/T56 |
| `tab-login`/quickLogin | `/entrar`, sessão segura | Credencial validada; cria sessão revogável e Membership | Auth + vínculo + tenant habilitado | T01/T02/T03/T59 |
| `tab-parent-dashboard`/upload/álbum | `/familia/[escola]` e Minhas recordações | Guardar privado ou criar submissão explicitamente | Guardião vinculado; autorização da criança | T04/T10/T11/T49/T64/T68 |
| Mural editável | gestão escolar/conteúdos | Atualização auditada e publicação em revisão | `SCHOOL_ADMIN`/capacidade de publicar | T39/T47 |
| Antigo painel admin da referência HTML | Não reutilizado; `/app/[escola]/dashboard` segue PNG | Métricas reais e chamadas por turma | Papel/escopo de equipe; contagens autorizadas | T57/T58/T67/T77 |
| Screenshot: sidebar e contexto | `SchoolAdminLayout` | Seletores filtram apenas Membership/turmas autorizadas | Role + scope vigente | T02/T03/T58/T76 |
| Screenshot: quatro métricas | `MetricCard` | Aggregate tenant-scoped no banco | Contexto escola/turma, audiência | T47/T57/T67 |
| Screenshot: atualizações e rápidas | `TodayUpdates`, `QuickActions` | Abrir recado/upload/relatório/chamada reais | Capacidade por fluxo | T39/T77 |
| Screenshot: frequência | `ClassAttendanceStrip` | Presenças não presumidas, estados explícitos | Professora/turma atribuída | T02/T09/T57/T76 |

### Observações de fidelidade

HTML: paleta azul pastel e elementos lúdicos, Fredoka/Poppins, cabeçalho translúcido amarelo, navegação, cards de turma, galeria e rodapé. Admin: sidebar violeta e superfície clara, composição de quatro métricas, duas colunas, ações rápidas e strip de frequência. A data/cadastro/rostos da referência não são dados do produto. Fonte Google CDN do original não foi validada no browser; runtime deve empacotar/usar carregamento Next compatível.

### Estado da implementacao M1

A coluna de operacao descreve o comportamento exigido pela especificacao; nao confirma que todos os fluxos estao prontos. Em M1 estao conectados dashboard/resumo, comunicados basicos, chamada, projecao publica minimizada e portal familiar vinculado. Galeria paginada com cursor, aprovacao, upload privado, consentimentos e comparacao visual automatizada seguem pendentes; consulte `docs/execucao.md` e `docs/matriz-requisitos.md`.
