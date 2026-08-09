# Sticker Bot

Bot de WhatsApp para receber, catalogar, pesquisar, processar e distribuir figurinhas e outras mídias. O projeto usa SQLite, uma bridge baseada em WPPConnect, processamento local de mídia e um painel web administrativo.

## Principais funções

- recebe imagens, vídeos, GIFs, áudios e figurinhas;
- converte e processa figurinhas estáticas e animadas;
- salva mídia, metadados, descrições, tags e estatísticas em SQLite;
- detecta duplicatas e permite busca por ID, texto, situação ou tema;
- gera descrições e tags com IA, incluindo o Gemma4/Lemonade local;
- permite editar, excluir, forçar duplicatas e organizar packs;
- baixa vídeos de URLs e extrai áudio;
- oferece rankings, reações, moderação e comandos administrativos;
- disponibiliza painel web para consulta, revisão e gestão do acervo;
- inclui watchdogs, reprocessamento de descrições falhas e rotinas de manutenção.

## Requisitos

- Node.js 20 ou superior;
- npm;
- uma conta do WhatsApp para conectar o bot;
- FFmpeg e ffprobe para os fluxos de áudio, vídeo e GIF;
- SQLite local.

Os recursos de IA são opcionais, mas exigem os provedores e variáveis correspondentes configurados no `.env`.

## Instalação

```bash
git clone https://github.com/ZanardiZZ/sticker-bot.git
cd sticker-bot
cp .env.example .env
npm ci
```

Configure o `.env` conforme os comentários de `.env.example`. Nunca versionar `.env`, tokens ou credenciais.

## Execução

O modo recomendado usa PM2 e sobe os três processos da aplicação:

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs
```

Processos:

- `WS-Socket-Server`: bridge e transporte da sessão do WhatsApp;
- `Bot-Client`: comandos, fila e processamento das mídias;
- `WebServer`: painel administrativo HTTP, normalmente na porta `3000`.

Para reiniciar após alteração de configuração:

```bash
pm2 restart all --update-env
```

## Comandos do bot

A lista completa fica disponível no próprio bot com `#comandos`. Alguns exemplos:

```text
#random
#pesquisar reação de surpresa
#top10
#topreactions 30 dias
#id 5120
#download <URL>
#downloadmp3 <URL>
#fotohd       (respondendo a uma imagem ou figurinha)
#ping
#verify
```

## Desenvolvimento e validação

```bash
npm run check             # lint, formatação e testes unitários
npm run smoke             # valida entrypoints e inicialização
npm run test:integration  # testes de integração
npm test                  # testes unitários e de integração
```

## Documentação importante

- [Arquitetura](docs/architecture.md) — componentes e fluxos principais;
- [Sistemas de IA](docs/ai-systems.md) — modelos, roteamento e integração de IA;
- [Testes](docs/TESTING.md) — estratégia e comandos de validação;
- [Watchdog de saúde](docs/HEALTH_WATCHDOG.md) — monitoramento e alertas;
- [Backfill e reprocessamento](docs/BACKFILL_MONITORING.md) — operações de recuperação;
- [Memória/OpenViking](docs/MEMORY_OPENVIKING.md) — integração de memória;
- [LGPD](docs/LGPD_INVENTORY.md) — inventário de dados e privacidade;
- [Roadmap](docs/ROADMAP.md) — evolução planejada;
- [Workflow de agentes](.github/agents/README.md) — convenções para desenvolvimento assistido.

O histórico de versões e correções está em [CHANGELOG.md](CHANGELOG.md).

## Licença

ISC.
