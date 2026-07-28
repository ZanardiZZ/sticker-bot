# Guia de implementação do roadmap — StickerBot2

> **Documento para agentes de IA.** Este arquivo transforma `docs/ROADMAP.md` em tarefas executáveis, com dependências, gates e critérios de aceite. Não substitui o roadmap: explica como cumpri-lo sem quebrar o runtime.

Atualizado em 2026-07-19.

---

## 1. Objetivo e regra principal

Implementar o roadmap de forma incremental, mantendo o StickerBot operacional no CT138 e convertendo cada ideia em uma entrega verificável.

Um agente **não deve marcar uma tarefa como concluída** apenas porque:

- escreveu o código;
- passou em `node --check`;
- executou um mock isolado;
- recebeu HTTP `200` de um serviço sem validar o resultado funcional.

A conclusão exige:

1. código implementado;
2. testes automatizados adequados;
3. smoke test real quando houver integração WhatsApp/IA/OpenViking;
4. logs ou resposta real comprovando o comportamento;
5. documentação atualizada;
6. nenhum segredo exposto.

---

## 2. Contexto operacional obrigatório

### 2.1 Localização

- Host Proxmox: `YOUR_PROXMOX_HOST`.
- Container: CT138.
- Projeto: `<PROJECT_ROOT>`.
- Usuário de execução: `dev`.
- Processos PM2:
  - `Bot-Client`;
  - `WS-Socket-Server`;
  - `WebServer`.
- Conta WhatsApp: **ZZ Bot**. Isso é o nome exibido da conta, não um segundo processo.

Acesso:

```bash
ssh -i ~/.ssh/hermes_proxmox_alyx_gordon \
  -o StrictHostKeyChecking=no root@YOUR_PROXMOX_HOST \
  "pct exec 138 -- bash -lc '<comando>'"
```

Para PM2 e dependências do projeto:

```bash
pct exec 138 -- bash -lc \
  'runuser -u dev -- bash -lc "cd <PROJECT_ROOT> && <comando>"'
```

### 2.2 Memória

Arquitetura atual:

```text
JSON local estruturado + OpenViking semântico
```

- OpenViking: `http://127.0.0.1:1933`.
- Health: `GET /health`.
- Não reintroduzir o antigo Memory-Bridge na porta `8766`.
- `CONVERSATION_ENABLE_MEMORY_CONTEXT=1` deve permanecer ativo.
- Usar o `result.session_id` retornado por `POST /api/v1/sessions`.
- Nunca criar memória real de usuário para teste; usar namespace/usuário descartável.

### 2.3 IA local

- Visão: endpoint local configurado no `.env`, modelo Qwen3-VL.
- Embeddings/OpenViking: respeitar a configuração existente; não trocar modelo de embeddings por modelo de chat.
- Nunca copiar, imprimir ou versionar `.env`, tokens, cookies, QR codes ou chaves.
- Mensagens de erro para usuário devem ser amigáveis e sanitizadas.

### 2.4 Modificação remota

Antes de editar um arquivo remoto:

1. confirmar o caminho no CT138;
2. criar backup datado somente se ele for útil;
3. editar com script transferido por base64 ou ferramenta equivalente;
4. rodar `node --check` nos `.js` alterados;
5. rodar `git diff --check`;
6. reiniciar somente o processo necessário com `--update-env`;
7. verificar PM2 e logs posteriores.

Não usar `cat` do `.env` para reupload: valores podem ser mascarados e destruir credenciais.

---

## 3. Protocolo de execução de cada tarefa

Todo agente deve seguir este ciclo:

### Fase A — Descoberta

- ler `AGENTS.md`, `docs/ROADMAP.md` e este arquivo;
- consultar o grafo do código quando disponível;
- localizar rotas, handlers, modelos, testes e contratos existentes;
- registrar o que já está implementado;
- identificar dependências e riscos.

### Fase B — Plano curto

Produzir antes do patch:

- objetivo;
- arquivos a modificar;
- arquivos a criar;
- testes a atualizar/criar;
- comportamento preservado;
- critério de aceite;
- plano de rollback.

### Fase C — Implementação

- preferir módulos pequenos;
- preservar contratos públicos;
- reutilizar modelos/serviços existentes;
- manter filas limitadas e caches com TTL/limite;
- evitar listeners, timers e processos sem limpeza;
- não misturar refatoração ampla com feature.

### Fase D — Testes

Executar primeiro testes focados, depois:

```bash
npm run test:unit
npm run test:integration
```

Se houver falha, classificar:

1. regressão real;
2. mock incompatível;
3. teste obsoleto.

Nunca remover cobertura válida apenas para obter `100%`.

### Fase E — Validação no alvo

Quando aplicável:

- smoke HTTP;
- smoke OpenViking com usuário descartável;
- smoke IA com fixture real;
- smoke WhatsApp supervisionado;
- inspeção de logs PM2;
- confirmação do estado dos processos.

### Fase F — Documentação e relatório

Atualizar `docs/ROADMAP.md`, marcar somente o item realmente concluído e relatar:

- arquivos alterados;
- testes executados e totais;
- evidência real;
- limitações;
- próximos passos.

---

# 4. Fases do roadmap

## Fase 0 — Preparação e baseline

### Objetivo

Criar uma linha de base antes de novas features.

### Passos

1. verificar `git status` e não apagar alterações de outro agente;
2. verificar PM2;
3. executar `npm run test:unit`;
4. executar `npm run test:integration`;
5. guardar totais e falhas preexistentes;
6. verificar `/healthz`, `/health/deep` sem autenticação e OpenViking `/health`;
7. confirmar que não há secrets no diff.

### Gate

Não iniciar uma fase nova se o baseline estiver desconhecido ou se o processo principal estiver offline.

---

## Fase 1 — Analytics de reações

### Objetivo

Evoluir o rastreamento existente para ranking temporal e visualização no painel.

### Descoberta obrigatória

Localizar e reutilizar:

- `database/models/reactions.js`;
- handler atual `#reacts`;
- rotas administrativas;
- componentes de tabs do painel;
- tabelas e índices existentes de reações.

Não criar uma segunda tabela sem provar que o modelo atual não atende.

### Implementação

#### 1.1 `#topreactions`

Implementar:

- limite seguro, por exemplo 1–50;
- filtro por janela: 24h, 7d, 30d ou total;
- filtro opcional por grupo;
- fallback amigável para ausência de dados;
- nomes/IDs sanitizados.

#### 1.2 Analytics no painel

Adicionar endpoint admin-protected que retorna apenas agregados:

```json
{
  "period": "7d",
  "totalReactions": 0,
  "topMedia": [],
  "emojiCounts": []
}
```

Adicionar card/tabela no painel com:

- ranking;
- contagem;
- período;
- atualização manual;
- estado vazio;
- estado de erro.

#### 1.3 Testes

- contagem por emoji;
- ordenação;
- filtro temporal;
- filtro por grupo;
- limite máximo;
- ausência de dados;
- permissão admin;
- XSS em nomes/descrições;
- painel com API indisponível.

### Gate

Só marcar como concluído após teste de rota autenticada e renderização real no painel.

---

## Fase 2 — Conversação contextual

> **Contrato obrigatório:** não alterar a descrição pública curta já produzida pelo pipeline atual. A interpretação rica deve ser persistida em campos/metadados separados e usada apenas para pesquisa, analytics ou compreensão contextual quando necessário.

### Metadados internos de stickers

Quando esta etapa for implementada, separar explicitamente:

- `description`: texto curto público, compatível com o comportamento atual;
- `visual_action`: ação/atividade observada;
- `emotion`: emoção ou expressão;
- `ocr_text`: texto visível;
- `cultural_reference`: personagem/obra/referência;
- `usage_intent`: reação provável;
- `context_signals`: sinais derivados de comentários/reação, sem dados pessoais desnecessários.

Os campos ricos não devem ser interpolados automaticamente no texto enviado ao WhatsApp.


### Objetivo

Tornar as respostas mais contextuais sem aumentar respostas indesejadas nem vazar informações privadas.

### Ordem obrigatória

Implementar uma dimensão por vez:

1. contexto de horário;
2. humor/trollagem;
3. ajuste de tom por sentimento;
4. resposta multimodal conversacional.

### Regras

- Não responder mais frequentemente só porque o classificador foi adicionado.
- O bot deve continuar respeitando allowlists, comandos e `computeShouldRespond()`.
- Não salvar sentimento efêmero como memória permanente.
- Não inferir dados sensíveis.
- Não colocar rótulos internos no texto enviado ao usuário.

### Implementação por dimensão

#### 2.1 Horário

- criar helper determinístico `getTimeContext(date, timezone)`;
- permitir timezone configurável;
- testar virada de dia e horário de verão;
- incluir contexto curto no prompt;
- não usar a hora do host de forma implícita.

#### 2.2 Humor/trollagem

- reutilizar regras de intenção existentes;
- separar humor de tentativa de prompt injection;
- usar confiança e fallback neutro;
- nunca tratar provocação como autorização para ignorar segurança.

#### 2.3 Sentimento

- começar com classes amplas: neutro, positivo, frustrado, urgente;
- usar somente para tom;
- fallback se IA estiver offline;
- limitar latência e tamanho do contexto.

#### 2.4 Multimodal conversacional

- separar mídia de legenda no roteamento;
- reutilizar descrição já produzida quando houver cache;
- não enviar a mesma imagem duas vezes à IA;
- impedir que base64, paths ou prompt interno apareçam na resposta.

### Testes

- horários fixos;
- grupo sem resposta;
- humor sem aumento indevido de respostas;
- prompt injection;
- IA offline;
- imagem com legenda;
- reasoning spill;
- contexto de memória separado de sentimento.

---

## Fase 3 — Testes e manutenção

### Objetivo

Eliminar contratos antigos e transformar incidentes em regressões permanentes.

### Passos

1. reescrever o teste de `#downloadmp3` contra o handler atual;
2. reescrever o teste de `#fotohd` com fixture/mocks atuais;
3. manter os testes no agregador somente quando cobrirem o runtime atual;
4. adicionar smoke supervisionado de imagem real;
5. remover backups temporários e scripts de investigação já absorvidos;
6. atualizar o runbook operacional.

### Incidentes que devem permanecer cobertos

- mídia com legenda não entra primeiro no Conversation Agent;
- WPP sem ID nativo usa `directPath + mediaKey`;
- somente um listener canônico fica ativo;
- `Reasoning`, `<think>` e `<thinking>` são removidos antes do envio;
- `ensureUser`/`ensureGroup` existem;
- memória E2E encontra folha OpenViking;
- `#esquecer` remove índice local e tenta sessões rastreadas;
- MD5 exato reutiliza resultado;
- deep health permanece protegido.

---

## Fase 4 — Geração de memes com feedback

### Objetivo

Criar um pipeline independente sem misturar geração experimental ao processamento normal de stickers.

### Pré-requisitos

- analytics de reações funcionando;
- limites de fila e tamanho definidos;
- storage temporário com limpeza;
- modelo de imagem local/remoto escolhido;
- política de custos e rate limit definida;
- testes de erro da IA.

### Pipeline

```text
texto/áudio
→ validação
→ transcrição opcional
→ geração de prompt
→ geração de imagem
→ conversão WebP 512x512
→ envio
→ registro
→ reação/feedback
→ analytics
```

### Implementação

Criar módulo isolado, por exemplo:

```text
src/services/memeGenerator/
  index.js
  promptBuilder.js
  imageGenerator.js
  audioInput.js
  memeRepository.js
```

Não criar tabela ou diretório sem migration/cleanup definidos.

Registrar no mínimo:

- usuário/grupo;
- texto original;
- prompt final sanitizado;
- modelo;
- duração;
- sucesso/falha;
- mídia resultante;
- reações agregadas.

### Testes

- texto válido;
- texto vazio;
- áudio inválido;
- transcrição offline;
- geração offline;
- imagem inválida;
- WebP acima do limite;
- duplicidade;
- abuso/rate limit;
- feedback sem mensagem vinculada.

---

## Fase 5 — Instalador/wizard web

### Objetivo

Permitir instalação limpa sem comprometer segurança.

### Passos

1. definir `SETUP_MODE` e impedir exposição fora dele;
2. criar wizard mínimo antes de implementar todos os recursos;
3. validar Node, dependências, permissões e espaço;
4. configurar administrador sem exibir senha;
5. configurar WhatsApp e QR Code com expiração;
6. gerar `.env` usando escrita segura;
7. executar migrations;
8. iniciar PM2 como usuário correto;
9. validar healthcheck e conexão;
10. documentar rollback.

### Segurança

- nunca armazenar QR em log;
- nunca devolver `.env` por endpoint;
- expirar sessão de setup;
- bloquear setup após conclusão;
- CSRF, rate limit e autenticação;
- mensagens sem stack trace.

### Gate

Testar em instalação limpa isolada antes de tocar no CT138 de produção.

---

## Fase 6 — Infraestrutura e escala

Executar somente após medir necessidade real.

### API pública/webhooks

- contrato versionado;
- autenticação por token rotacionável;
- rate limit por cliente;
- payloads sem segredos;
- idempotência;
- logs de auditoria;
- testes de replay e abuso.

### CDN

- somente mídia pública;
- URLs assinadas/expiráveis;
- não publicar mídia privada de grupos;
- política de retenção;
- fallback para storage local.

### Redis

Não introduzir Redis apenas por existir no roadmap. Antes medir:

- hits/misses;
- latência;
- memória do processo;
- volume concorrente;
- necessidade de compartilhar estado entre processos.

### Escala horizontal

Antes de múltiplas instâncias, separar:

- locks;
- fila;
- deduplicação;
- sessões WhatsApp;
- cache;
- métricas;
- migrações.

---

## 5. Padrão de testes por entrega

Cada feature deve incluir:

### Unitário

Funções puras, validações, normalização e regras de negócio.

### Integração

Handlers, modelos, rotas e adapters com mocks que reproduzem contratos reais.

### E2E controlado

OpenViking, IA, painel ou filesystem real, usando namespace descartável.

### Smoke de produção

Somente quando houver risco de integração WhatsApp/PM2/IA. Deve ser supervisionado e não enviar mensagens públicas sem autorização explícita.

Comandos padrão:

```bash
npm run test:unit
npm run test:integration
node --check <arquivos-js-alterados>
git diff --check
```

---

## 6. Critérios de rollback

Fazer rollback da fase se ocorrer qualquer um dos seguintes:

- PM2 offline ou em loop de restart;
- aumento de mensagens duplicadas;
- mídia com legenda desviada para conversa;
- vazamento de reasoning/prompt/segredo;
- OpenViking recebendo dados no namespace errado;
- healthcheck público sem autenticação;
- fila sem limite;
- testes válidos removidos para mascarar falha;
- alteração incompatível sem migration.

Rollback deve restaurar o último arquivo funcional, reiniciar apenas o processo afetado e confirmar logs limpos.

---

## 7. Formato obrigatório do relatório do agente

```markdown
## Tarefa

## Arquivos alterados

## Comportamento implementado

## Testes executados
- comando:
- resultado:

## Validação real
- alvo:
- evidência:

## Riscos/limitações

## Documentação atualizada

## Próximo gate
```

Nunca escrever “implementado com sucesso” sem incluir saída real de teste ou explicar claramente o bloqueio.
