# Armazenamento de mídia privada

## Configuração local

O driver é configurado por `PRIVATE_STORAGE_DRIVER`: `auto` tenta S3 e usa disco local se o endpoint não estiver configurado ou falhar; `local` força disco local; `s3` exige S3. O diretório padrão é `./var/private-storage`, fora de `public/`; `PRIVATE_STORAGE_LOCAL_DIR` escolhe uma subpasta relativa segura dentro de `./var/`. O disco local é apropriado para desenvolvimento e ambientes com volume persistente; em múltiplas instâncias, configure storage compartilhado ou S3.

Use os serviços `storage` (RustFS compatível com S3) e `clamav` do `compose.yaml` quando disponíveis. Copie os valores locais de `.env.local.example` para `.env.local`, mantendo o `DATABASE_URL` já configurado. Não imprima nem versione chaves. O bucket configurado deve ficar privado, sem ACL ou policy de leitura pública.

Com Docker disponível:

```powershell
docker compose up -d storage clamav
npm.cmd run storage:init
```

O comando `storage:init` só aceita banco de desenvolvimento/teste em loopback e endpoint S3 local. Ele cria o bucket quando ausente; não configura bucket de produção.

## Fluxo entregue

- `POST /api/app/[escola]/midias` aceita JPEG, PNG ou WebP até 5 MB, valida assinatura e decodificação, aplica limite de pixels, orienta e reduz a imagem para WebP, removendo os metadados da origem. A chave é gerada no servidor como `<tenantId>/<assetId>`; nome enviado pelo usuário nunca entra no caminho do objeto.
- MariaDB 10.10.7 guarda metadados, estado de varredura e vínculos tenant-scoped. Os bytes ficam no bucket S3 privado ou no diretório local selecionado pelo driver. Chaves locais usam o prefixo `local/<tenantId>/<id>` e não expõem caminhos absolutos.
- Sem ClamAV disponível, a aplicação tenta manter uma cópia no storage local configurado, enquanto objeto e metadados permanecem em `QUARANTINED`; nenhum download é liberado. O worker reprocessa a verificação depois. Se o diretório local também não estiver disponível, o objeto permanece no backend atual, ainda bloqueado. Com resultado limpo, a mídia passa para `PENDING` editorial. Detecção de conteúdo inseguro bloqueia o objeto e registra estado `REJECTED`.
- `GET /api/app/[escola]/midias/[assetId]` revalida sessão, tenant, papel, turma e vínculo de equipe em cada requisição. Serve somente conteúdo verificado e pendente/publicado, como anexo, com `no-store`; nunca retorna URL do bucket.
- O diário aceita até três imagens por envio (5 MB cada), reencoda para WebP e liga cada evidência à execução. A rota de download revalida tenant, vínculo e turma e libera somente arquivos com resultado limpo. Evidências do diário ficam restritas à equipe; não aparecem no portal, no álbum familiar ou na fila editorial. Consentimento continua obrigatório antes de criar qualquer fluxo de compartilhamento/publicação.
- O álbum familiar guarda somente uploads próprios do responsável, ligados à criança e ao vínculo ativo/aprovado. `PRIVATE_STORAGE` e `SCHOOL_REVIEW` são consentimentos separados; o segundo cria uma submissão editorial explícita. O álbum privado não é visível a outros responsáveis nem à equipe.
- A equipe só encontra submissões com consentimento ativo e criança matriculada em turma dentro do escopo atual. Aprovar registra decisão editorial e não publica para famílias. Professoras/assistentes precisam ter atribuição à turma; administração vê a fila da escola.
- Retirar a autorização de revisão bloqueia novos downloads pela equipe e preserva o arquivo privado do autor. Retirar a autorização de armazenamento bloqueia imediatamente todos os downloads, retira a submissão e cria evento tenant-scoped no outbox.
- `npm.cmd run storage:drain` processa até 50 remoções, 50 revarreduras de mídia e 50 de evidências pendentes por execução. Usa lease com recuperação após falha, deleção idempotente e rejeita chaves fora do prefixo do tenant. Uma revarredura só libera o arquivo após resposta limpa do ClamAV e se o ativo ainda estiver em quarentena; revogação concorrente não reativa o arquivo. Configure um agendador operacional depois de validar o backend escolhido; o worker não foi executado nesta sessão.
- Aprovação editorial não significa autorização para publicar. O portal não faz publicação em mural/portfólio nem entrega acesso a outros familiares.

## Limites atuais

Uploads locais, downloads e revarredura de evidências ainda precisam de validação com bytes reais. Sem ClamAV, o arquivo permanece em quarentena e não pode ser baixado até que o worker obtenha resultado limpo. O worker de outbox também precisa de validação. A fila editorial tem paginação numerada e filtros por status, turma, criança, autor e período; registra eventos imutáveis por decisão e permite reenvio familiar versionado após pedido de ajuste. Permanecem pendentes notificações, edição de metadados, outros formatos e publicação em mural/portfólio com consentimentos de todos os sujeitos.

