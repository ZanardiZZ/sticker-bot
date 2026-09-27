# Wizard/installer do StickerBot2

## Objetivo

Configurar uma cópia nova do StickerBot2 no primeiro boot, pela LAN, sem expor credenciais e sem exigir edição manual inicial do `.env`.

## Instalação nova

```bash
bash scripts/ops/install.sh
```

O instalador verifica Node.js 20+, npm e Git, instala dependências, cria um `.env` temporário com `0600`, inicia somente o WebServer e imprime uma URL semelhante a:

```text
http://IP_DA_MAQUINA:3000/setup?token=TOKEN_TEMPORARIO
```

O token é segredo de bootstrap. Não o publique nem o inclua em tickets ou logs compartilhados.

## Wizard

O fluxo `/setup` configura:

1. grupo principal, grupos permitidos e número do administrador;
2. conta inicial de administrador;
3. recursos opcionais e fuso horário;
4. resumo e confirmação explícita.

O QR de pareamento é consultado pelo endpoint protegido `/setup/qr` e exibido na interface quando o bridge criar `storage/auth_info_baileys/pairing.qr`. A rota não cria uma cópia permanente do QR.

## Finalização

Ao confirmar:

1. o `.env` atual recebe backup timestampado;
2. um novo `.env` é gravado com permissão `0600`;
3. `SETUP_MODE=false` e `SETUP_WIZARD_ENABLED=false` são gravados;
4. o token da sessão é invalidado;
5. o WebServer agenda `pm2 restart all --update-env` em processo separado.

O navegador recebe a resposta antes do reinício.

## Instalação a partir de clone já existente

```bash
cp .env.example .env
npm ci
```

Edite apenas o mínimo necessário:

```env
PORT=3000
SETUP_WIZARD_ENABLED=true
SETUP_WIZARD_TOKEN=token-temporario-longo
```

Depois execute:

```bash
npm run web
```

Abra a URL com o token. Após finalizar, o wizard grava o restante da configuração e reinicia o PM2 quando essa cópia já estiver sob PM2.

## Segurança e rollback

- O wizard é desabilitado por padrão.
- O acesso deve permanecer restrito à LAN/firewall.
- Segredos não são exibidos no resumo.
- O backup do `.env` fica fora do Git.
- Se a configuração falhar, restaure o backup correspondente e reinicie o PM2 manualmente.
- Não versionar `.env`, QR, sessões WhatsApp, bancos ou logs.

## Limitações conhecidas

- A primeira versão ainda precisa de validação em uma instalação limpa.
- O QR depende do bridge Baileys estar iniciado e gravando o arquivo de pareamento.
- A instalação não provisiona pacotes do sistema como FFmpeg; esses pré-requisitos devem existir no host.
