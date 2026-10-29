# Subprocessadores e operadores

Não há subprocessador de produção conectado neste checkpoint.

| Serviço previsto | Dados que poderá tratar | Estado / validação necessária |
|---|---|---|
| MariaDB 10.10.7 compartilhado por ambiente | Registros da escola | MariaDB local testado; infraestrutura e backup de produção ainda não definidos |
| S3 compatível privado | Arquivos/imagens | Não conectado; escolher fornecedor e avaliar localização/contrato |
| SMTP | Convites/notificações | Mailpit apenas no compose, não validado |
| Redis/worker | Jobs tenant-scoped | Compose preparado; não integrado |
| Antivírus | Conteúdo de arquivo | Imagem prevista; serviço não conectado |
| IA / cobrança | Dados enviados conforme operação | Não integrados; dependem de opt-in, contratos e sandbox |

Verificar contrato, região, transferência, retenção, segurança e lista vigente antes de habilitar qualquer fornecedor.
