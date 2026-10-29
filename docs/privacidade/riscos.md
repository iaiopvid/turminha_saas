# Avaliação inicial de riscos e impacto

Rascunho de triagem, não avaliação jurídica ou DPIA concluída.

| Risco | Impacto | Controle atual | Trabalho pendente |
|---|---|---|---|
| Exposição de dados de criança entre escolas | Alto | tenantId em consultas; FKs compostas em relações principais; teste negativo local | Cobertura adversarial de todas as rotas/entidades e recuperação de backup em ambiente de ensaio |
| Acesso familiar a criança não vinculada | Alto | vínculo explícito e smoke cross-tenant negado | Matriz completa de autorização e trilha de auditoria |
| Exposição pública de identidade/imagem | Alto | projeção pública minimizada; false por padrão; sem mídia publicada | consentimentos verificáveis, moderação e autorização de mídia |
| Arquivo malicioso ou URL previsível | Alto | uploads desabilitados | bucket privado, URLs assinadas curtas, antivírus e testes |
| Sessão roubada | Alto | cookie HTTPOnly/SameSite, token aleatório com hash no DB e expiração | proteção CSRF conforme endpoints, rate limit e monitoramento |
| Retenção indevida / pedido de titular não atendido | Alto | ainda sem fluxo | política aprovada, workflow, auditoria e execução verificável |

Revisão de risco e decisão de liberar dados reais são pendentes de validação humana/jurídica e testes do produto completo.
