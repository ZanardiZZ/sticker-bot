# StickerBot2 — Roadmap atual

Atualizado em 2026-07-19. Este é o backlog principal. Documentos em `docs/legacy/` são históricos.

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
- [ ] tendências semanais/mensais;
- [ ] notificações opcionais para stickers muito reagidos.

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
- [ ] limpar backups temporários e atualizar o runbook;
- [ ] revisar retenção do cache de mídia.

## Projetos de produto

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

- Documentos em `docs/legacy/`.
- Planos antigos de arquitetura Baileys/socket.
- A antiga integração Memory-Bridge na porta `8766`.
