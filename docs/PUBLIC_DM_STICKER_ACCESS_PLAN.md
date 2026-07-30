# Acesso público de figurinhas via WhatsApp

**Status:** Fases 1 e 2 implementadas no alvo e testadas; acesso mundial ainda não liberado.

**Piloto atual:** `PUBLIC_DM_ACCESS_ENABLED=1`, `PUBLIC_DM_ALLOW_ALL=0`; somente usuários explicitamente aprovados em `dm_users.allowed=1` podem usar o caminho público.

**Escopo:** preparar o StickerBot2 para receber solicitações de usuários individuais de qualquer país, mantendo grupos internos e comandos privilegiados protegidos.

## Estado atual confirmado

- `src/bot/messageHandler.js` rejeita DMs fora de `ALLOWED_DM_JIDS` antes de consultar `dm_users`.
- Grupos continuam protegidos por `ALLOWED_GROUP_IDS`/allowlist.
- A tabela `dm_users` já registra `user_id`, `allowed`, `blocked`, `note` e atividade.
- `#ID <número>` já busca a mídia, envia o arquivo original e retorna descrição/tags.
- O roteador geral possui muitos comandos além de `#ID`; o modo público não pode passar por ele sem uma barreira própria.
- A fila existente de mídia é destinada ao processamento de imagens recebidas e não deve ser usada para solicitações públicas de stickers já armazenados.

## Invariantes de segurança

1. A abertura é somente para mensagens diretas; grupos permanecem na allowlist atual.
2. Usuário público só pode executar `#ID <inteiro positivo>`.
3. Nenhuma DM pública entra em IA, memória, conversa natural, edição, pesquisa, ranking, upload, análise de mídia ou comandos administrativos.
4. A autorização é verificada antes de chamar o roteador geral de comandos e antes de recursos caros.
5. Bloqueio explícito sempre vence qualquer permissão, pagamento ou quota.
6. O limite precisa ser persistido no SQLite e aplicado de modo atômico; memória do processo não é fonte de verdade.
7. Identidade de WhatsApp/LID, username do site e nome de contato são conceitos distintos; nomes de contatos nunca são usados como identidade pública.
8. Falhas de autorização, quota e pagamento retornam mensagens curtas e amigáveis, sem JSON cru, stack trace ou detalhes internos.
9. A ativação global não ocorre antes de um piloto fechado e de uma chave de configuração explícita.

# Fase 1 — modo público restrito, sem pagamento

## Objetivo

Permitir que DMs experimentais solicitem stickers existentes por `#ID`, com quota persistente e todos os demais caminhos bloqueados. A fase deve funcionar atrás de uma allowlist de teste, mesmo que o desenho final permita qualquer número.

## Configuração inicial recomendada

```text
PUBLIC_DM_ACCESS_ENABLED=0
PUBLIC_DM_EXPERIMENTAL_IDS=<lista normalizada de JIDs/LIDs>
PUBLIC_DM_DAILY_LIMIT=5
PUBLIC_DM_COOLDOWN_SECONDS=10
PUBLIC_DM_HOURLY_LIMIT=30
PUBLIC_DM_MAX_CONCURRENT=1
```

Durante desenvolvimento, `PUBLIC_DM_ACCESS_ENABLED=0` permanece desligado. No piloto, a lista experimental é a única forma de entrada; não remover a allowlist global ainda.

## Alterações previstas

### 1. Criar um gate dedicado

Adicionar um módulo pequeno, por exemplo `src/services/publicDmAccess.js`, com funções puras e testáveis:

- `isPublicDmCandidate(context)`
- `normalizePublicUserId(context)`
- `parseStickerIdCommand(text)`
- `getPublicDmAccess(userId)`
- `checkPublicDmEligibility(userId, mediaId)`
- `reservePublicDelivery(userId, mediaId, messageId)`
- `recordPublicDeliveryResult(...)`

O `messageHandler` deve chamar esse gate somente para DM. Grupo não passa por ele.

### 2. Separar o caminho público do roteador geral

Antes de `handleCommand(...)`:

```text
se for DM pública e o modo estiver habilitado/pilotado:
    validar somente #ID
    verificar bloqueio e acesso
    verificar limite/cooldown
    entregar sticker
    registrar resultado
    retornar
```

Uma DM pública não deve chegar ao `handleGroupChatMessage`, `handleTaggingMode`, `processIncomingMedia` ou ao roteador geral.

### 3. Validar somente o formato permitido

Aceitar apenas uma forma equivalente a:

```text
#ID 17940
```

Regras:

- Case-insensitive para `#ID`.
- Um único ID numérico.
- ID inteiro positivo.
- Sem listas, intervalos ou texto adicional.
- Limite de tamanho do corpo da mensagem.
- Não aceitar comandos naturais como “me mande a figurinha 17940”.

### 4. Evoluir o registro de usuários

Preservar `dm_users` para compatibilidade e adicionar, por migração idempotente, campos mínimos de estado público ou uma tabela complementar:

```text
public_access_status: pending | active | expired | blocked | suspended
public_access_source: pilot | manual
public_access_expires_at
public_daily_limit
public_last_delivery_at
public_quota_day
public_quota_used
```

Não usar somente um contador em memória.

### 5. Criar registro de consumo

Criar `dm_delivery_usage`:

```text
id
user_id
media_id
request_message_id
requested_at
quota_day
status: reserved | sent | failed | uncertain | rejected
failure_code
created_at
```

Adicionar índices para:

- `(user_id, quota_day, status)`
- `(user_id, request_message_id)` único quando possível
- `(requested_at)`

### 6. Aplicar reserva atômica

A reserva deve ocorrer antes do envio e dentro de transação/operação atômica:

1. Verificar bloqueio.
2. Verificar status/expiração.
3. Verificar quota do dia.
4. Verificar cooldown.
5. Inserir reserva idempotente por `request_message_id`.
6. Incrementar uso somente uma vez.
7. Enviar a mídia.
8. Atualizar para `sent`, `failed` ou `uncertain`.

Mensagens duplicadas do WhatsApp não podem consumir duas quotas.

Para falha ambígua de transporte, usar estado `uncertain`; não repetir automaticamente uma entrega não idempotente.

### 7. Restringir o custo da operação

O caminho público deve:

- Consultar somente uma mídia pelo ID.
- Não fazer busca textual.
- Não chamar modelo de IA.
- Não baixar mídia recebida.
- Não gravar memória.
- Não consultar nomes de contatos para exibição.
- Não entrar na fila de processamento de mídia recebida.
- Não retornar erros internos.

## Critérios de aceite da Fase 1

- Grupo não permitido continua rejeitado.
- DM fora do piloto continua sem entrega.
- DM piloto com `#ID válido` entrega uma mídia existente.
- `#ID` é o único comando aceito no caminho público.
- `#random`, `#pesquisar`, `#memorias`, `#top5users`, `#editar`, `#forcar`, texto natural e mídia recebida não ativam operações públicas.
- Usuário bloqueado nunca recebe entrega.
- Quota diária é respeitada após reinício do processo.
- Cooldown é respeitado após reinício.
- Reenvio do mesmo `message_id` não duplica entrega nem consumo.
- ID inexistente não consome quota, salvo decisão explícita posterior.
- Erros ao enviar ficam registrados como estado sanitizado.
- `PUBLIC_DM_ACCESS_ENABLED=0` fecha o caminho inteiro.

## Testes da Fase 1

### Unitários

- Parser de `#ID`.
- Normalização JID/LID.
- Bloqueio de comandos não permitidos.
- Quota no limite e acima do limite.
- Virada do dia.
- Cooldown.
- Idempotência por `message_id`.
- Bloqueio e suspensão.
- Expiração.

### Integração

- DM piloto → busca e entrega.
- DM não piloto → rejeição sem chamada de `findById`.
- Grupo → fluxo atual preservado.
- Mídia recebida de DM pública → não entra na fila.
- Reinício do processo → quota permanece.
- Concorrência de duas mensagens → somente uma reserva válida quando a quota é 1.

### Operação

- `node --check` nos arquivos alterados.
- `npm run test:unit`.
- `npm run test:integration`.
- PM2 online após reinício controlado do `Bot-Client`.
- Smoke com dois números de teste, nunca com abertura mundial.

## Rollback da Fase 1

1. Definir `PUBLIC_DM_ACCESS_ENABLED=0`.
2. Reiniciar somente `Bot-Client` com `--update-env`.
3. Confirmar que a DM pública volta a ser rejeitada.
4. Manter as tabelas e os registros para auditoria; não apagar dados automaticamente.
5. Reverter código somente após preservar logs e backup do banco.

# Fase 2 — rate limit persistente e controle operacional

## Objetivo

Transformar o piloto em um mecanismo robusto de quota, deduplicação e observabilidade, ainda sem pagamento obrigatório e ainda sem abertura mundial.

## Escopo

- Tabela `dm_delivery_usage` definitiva.
- Quota diária configurável por usuário.
- Limite global por minuto/hora.
- Cooldown por usuário.
- Limite de concorrência por usuário e global.
- Estados de entrega `sent`, `failed` e `uncertain`.
- Painel administrativo.
- Métricas sem exposição pública de identificadores.

## Política inicial

```text
quota padrão: 10/dia
cooldown: 10 segundos
limite adicional para usuário registrado no site: 30/dia
quota total de usuário registrado: 40/dia
concorrência: 1 reserva por mensagem (SQLite `BEGIN IMMEDIATE`)
limite global: ainda deve ser adicionado antes da abertura mundial
```

A quota de 10 é a política aprovada para a implementação inicial. O limite adicional de 30 é aplicado somente quando o vínculo entre o WhatsApp verificado e uma conta aprovada do site é encontrado; nesses casos, a quota total é 40/dia.

## Painel administrativo

Adicionar seção protegida para:

- Listar usuários públicos por identificador mascarado.
- Ver status, quota usada e quota restante.
- Ver última atividade e última entrega.
- Bloquear, suspender, liberar manualmente e alterar quota.
- Alterar validade do acesso.
- Consultar falhas agregadas.
- Reprocessar somente estados seguros, sem retry automático de envio ambíguo.

O painel não deve mostrar nome de contato do WhatsApp como nome público. Para administração, exibir o mínimo necessário e mascarar quando possível.

## Critérios de aceite da Fase 2

- Dois processos concorrentes não ultrapassam a quota.
- Reinício não zera uso.
- Repetição de evento não duplica entrega.
- Estado `uncertain` não gera retry automático.
- Falha de banco fecha o caminho com segurança, sem liberar por fallback.
- Falha de rate limiter não transforma o sistema em ilimitado.
- O limite global impede tempestade de solicitações.
- O painel altera status e quota sem expor dados para usuários comuns.
- Logs não contêm nome de contato, telefone completo ou payload sensível desnecessário.

## Gate para sair da Fase 2

Só avançar para pagamento quando houver:

- Pelo menos um piloto controlado concluído.
- Testes de concorrência aprovados.
- Quota e deduplicação comprovadas após reinício.
- Métricas de custo e capacidade por entrega.
- Política de retenção definida para uso e pagamentos futuros.
- Rollback testado.
- Nenhuma regressão no atendimento dos grupos internos.

# Fase 3 — pagamento/doação: anotações para o futuro

- Escolher provedor com webhook assinado e suporte à região/moeda desejada.
- Criar checkout no site, não dentro do parser do WhatsApp.
- Validar webhook de forma idempotente.
- Criar `dm_entitlements` separado de `dm_users`.
- Liberar acesso somente após confirmação do provedor.
- Definir validade, por exemplo 30 dias por doação.
- Tratar reembolso, chargeback, pagamento pendente e duplicado.
- Nunca confiar em `payment_id` informado pelo usuário.
- Não armazenar cartão nem segredo de pagamento no bot.
- Registrar auditoria administrativa e manter mensagens de erro amigáveis.
- Só liberar o pagamento em produção depois de testar sandbox, webhook repetido e rollback de entitlement.

# Fase 4 — liberação gradual: anotações para o futuro

- Começar com `PUBLIC_DM_ACCESS_ENABLED=0` e piloto por lista.
- Liberar poucos usuários reais em canário.
- Começar com a política aprovada de 10/dia.
- Monitorar entregas, falhas, latência, CPU, RAM, fila e eventos `uncertain`.
- Aumentar progressivamente somente com baseline comparável.
- Preparar bloqueio emergencial por configuração.
- Criar limites separados para usuário, IP do site, provedor de pagamento e capacidade global.
- Não anunciar acesso mundial antes de confirmar que o WhatsApp, o banco e o armazenamento suportam o volume.
- Manter grupos internos em caminho separado durante toda a expansão.

# Fase 5 — escala: anotações para o futuro

- Separar fila de entregas públicas da fila de processamento de mídia recebida.
- Adicionar cache de metadados e caminhos de mídia.
- Usar worker dedicado para entregas públicas.
- Usar rate limit distribuído se houver mais de uma instância.
- Adicionar circuit breaker para WhatsApp, SQLite e armazenamento.
- Definir capacidade máxima por janela e comportamento de degradação.
- Medir custo por entrega e taxa de falha por provedor/rota.
- Planejar migração para banco mais apropriado somente se o volume justificar.
- Não tornar o envio automaticamente repetível enquanto o transporte não tiver uma confirmação idempotente segura.
- Criar alertas operacionais para quota global, falhas consecutivas, crescimento da fila e eventos ambíguos.

# Decisões registradas

1. Quota padrão: 10 entregas/dia.
2. Cooldown: 10 segundos.
3. Usuário registrado no site: +30/dia, totalizando 40/dia.
4. O acesso público começa em piloto fechado; `PUBLIC_DM_ALLOW_ALL=0`.
5. A doação/pagamento continua reservada à Fase 3.
6. O limite global de capacidade será definido após baseline operacional.

**Implementação atual:** Fases 1 e 2 estão publicadas atrás da aprovação em `dm_users.allowed=1`, com tabelas persistentes de quota e auditoria. O modo público não deve ser aberto mundialmente até o limite global, canário e observabilidade da Fase 4 estarem concluídos.
