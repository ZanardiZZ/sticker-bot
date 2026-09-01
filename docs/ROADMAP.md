# StickerBot2 — Roadmap atual

Atualizado em 2026-09-01. Este é o backlog principal. Documentos históricos não fazem parte da árvore pública atual.

## Estado operacional

- ✅ WhatsApp/bridge e processos PM2 operacionais.
- ✅ Pipeline de mídia com legendas, eventos WPP sem ID nativo, deduplicação e fallback criptográfico.
- ✅ Conversão de stickers e análise multimodal local.
- ✅ Sanitização de `Reasoning`, `<think>` e `<thinking>`.
- ✅ Memória híbrida: JSON local + OpenViking em `127.0.0.1:1933`.
- ✅ `#memorias` e `#esquecer` com remoção local e sessões OpenViking rastreadas.
- ✅ Healthcheck profundo protegido e card no painel administrativo.
- ✅ Cache de mídia por conteúdo com TTL/limite.
- ✅ Suítes com regressões dos incidentes recentes.

## Próximo ciclo — prioridade alta

### Analytics de reações — 🟡 parcial

Já existe rastreamento e `#reacts`. Implementar:

- ✅ `#topreactions` com janela temporal e grupo;
- ✅ ranking básico no painel administrativo;
- ✅ tendências semanais/mensais no painel administrativo;
- ✅ notificações opcionais por marco, desativadas por padrão; a contagem exibida é global por mídia;

### Contrato de descrição e metadados — 🟡 parcial

A descrição retornada ao usuário deve continuar curta e simples. A análise rica fica separada em metadados internos para pesquisa e contexto:

- 🟡 ação/atividade visual;
- 🟡 emoção/expressão;
- 🟡 OCR e texto visível;
- 🟡 referência cultural/personagem;
- 🟡 intenção provável de uso;
- 🟡 contexto de uso e comentários associados;
- ✅ armazenamento separado da descrição pública;
- ✅ busca inteligente sobre metadados sem alterar a resposta pública;

Regra: metadados internos nunca devem ser concatenados automaticamente à descrição curta enviada ao usuário.

Comando implementado: `#pesquisar <consulta>`; retorna stickers disponíveis, preservando a descrição simples no retorno.

### Conversação contextual — 🟡 parcial

- ✅ contexto de horário opt-in;
- ✅ detecção heurística de humor/trollagem opt-in;
- ✅ ajuste de tom para sentimento amplo opt-in;
- [ ] respostas conversacionais sobre imagens/stickers.

### Testes e manutenção — 🟡 parcial

- [ ] reescrever e reativar testes antigos de `#downloadmp3` e `#fotohd`;
- [ ] smoke test real de mídia no WhatsApp;
- [ ] revisar retenção do cache de mídia;
- ✅ scheduler atualiza `count_random` somente após entrega confirmada e evita timers/listeners duplicados;
- ⚠️ atualizar runbook operacional com o canário de dependências WPPConnect/Puppeteer (5 vulnerabilidades transitivas high ainda abertas).

## Projetos de produto

## Projeto de produto — acesso público via WhatsApp

Plano detalhado em [`PUBLIC_DM_STICKER_ACCESS_PLAN.md`](./PUBLIC_DM_STICKER_ACCESS_PLAN.md).

- 🟢 implementado: Fases 1 e 2 atrás de piloto fechado (`#ID`, 10/dia, cooldown de 10s, +30/dia para usuários registrados); Fases 3–5 permanecem futuras.
- ⚪ futuro: Fase 3 (pagamento/doação);
- ⚪ futuro: Fase 4 (liberação gradual);
- ⚪ futuro: Fase 5 (escala e fila dedicada).

**Não ativado:** o atendimento público continua fechado até a implementação e validação das gates.

### Geração de memes com feedback — 🔵 não iniciado como módulo independente

`texto/áudio → transcrição → prompt visual → imagem → sticker → reações → ranking`

- [ ] módulo independente de geração;
- [ ] registro de prompt e resultado;
- [ ] geração a partir de áudio;
- [ ] métricas de desempenho dos prompts;
- [ ] aprendizado baseado em reações.

### Instalador/wizard web — 🔵 não iniciado

- [ ] wizard `/setup`;
- [ ] configuração inicial segura;
- [ ] QR Code e validação WhatsApp;
- [ ] instalação de dependências e PM2;
- [ ] testes em instalação limpa.

## Infraestrutura — baixa prioridade

- [ ] API pública documentada com rate limiting;
- [ ] webhooks para integrações externas;
- [ ] CDN para mídia pública;
- [ ] Redis somente se o volume justificar;
- [ ] escalabilidade horizontal após separar estado compartilhado.

## Fora do backlog atual

- Planos antigos de arquitetura Baileys/socket.
- A antiga integração Memory-Bridge na porta `8766`.
