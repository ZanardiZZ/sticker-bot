# Sticker Bot

Bot para WhatsApp com painel web para armazenar, buscar, organizar e administrar stickers e outras mídias recebidas no grupo.

## O que o bot faz

- recebe imagens, vídeos, GIFs e áudios enviados no WhatsApp
- salva a mídia com metadados em SQLite
- envia stickers por comando, por ID, por tema e por packs
- oferece comandos de moderação e administração
- expõe um painel web para consulta, revisão e gestão do acervo
- pode usar OpenAI para transcrição, descrição e tags automáticas

## Principais funções

- bot WhatsApp com bridge dedicada para manter a sessão
- processamento de mídia com suporte a sticker estático e animado
- painel web para administração e análise
- detecção de duplicatas
- packs de stickers
- downloads por URL e extração de áudio
- filtros e controles administrativos

## Requisitos

- Node.js 20+
- npm
- conta de WhatsApp para conectar o bot

O projeto usa SQLite localmente. Para alguns recursos opcionais, você pode precisar de:

- `OPENAI_API_KEY` para recursos com IA
- SMTP para notificações por e-mail

## Instalação

```bash
git clone https://github.com/ZanardiZZ/sticker-bot.git
cd sticker-bot
cp .env.example .env
npm ci
```

Se houver erro com módulos nativos:

```bash
npm rebuild sqlite3 sharp
```

## Configuração mínima

Edite o arquivo `.env` e defina pelo menos:

```env
AUTO_SEND_GROUP_ID=seu_grupo
ADMIN_NUMBER=5511999999999@c.us
```

Veja `.env.example` para as demais opções.

## Como rodar

Fluxo recomendado, inclusive em desenvolvimento:

```bash
pm2 start ecosystem.config.js
```

Isso sobe:

- processo `0`: bridge/socket server
- processo `1`: bot principal
- processo `2`: painel web

Logs úteis:

```bash
pm2 logs 0
pm2 logs 1
pm2 logs 2
```

Se quiser rodar sem PM2, use os scripts diretos em terminais separados:

```bash
npm run baileys:server
npm run bot
npm run web
```

O painel web fica em `http://localhost:3000`.

## Comandos úteis

Exemplos de comandos do bot:

- `#random`
- `#count`
- `#top10`
- `#123` para buscar mídia por ID
- `#tema <tema>`
- `#pack` e `#addpack <nome>`
- `#download <url>`
- `#downloadmp3 <url>`
- `#perfil`
- `#ping`

## Desenvolvimento

Scripts principais:

```bash
npm run check
npm run smoke
npm run test:integration
```

Uso recomendado:

- mantenha a aplicação rodando via `pm2 start ecosystem.config.js`
- acompanhe logs com `pm2 logs 0` e `pm2 logs 1`
- `npm run check` para lint, format check e testes unitários
- `npm run smoke` para validar entrypoints e wiring de startup
- `npm run test:integration` para mudanças que cruzam subsistemas

## Contribuição

1. crie uma branch para a mudança
2. faça alterações pequenas e focadas
3. atualize docs quando o comportamento mudar
4. rode a validação adequada antes do PR
5. abra o pull request com contexto claro

Se a mudança for de código, use pelo menos:

```bash
npm run check
```

E também:

- `npm run smoke` se mexer em entrypoints, bridge ou web server
- `npm run test:integration` se mexer em banco, rotas, fluxo de mídia ou integração entre módulos

## Documentação adicional

- `docs/` para documentação técnica e histórica
- `.github/agents/README.md` para guias de agentes e workflow de desenvolvimento

## Licença

ISC
