# Health Watchdog (Fase 3 - hardening operacional)

## Objetivo
Monitorar continuamente a saúde do bot e aplicar auto-recuperação para falhas comuns sem intervenção manual.

## O que monitora
1. PM2 apps obrigatórios online:
   - WS-Socket-Server
   - Bot-Client
   - WebServer
2. Endpoint de saúde web:
   - `http://127.0.0.1:3000/webhook/status` deve retornar `status: active`
3. Erros críticos de sessão WhatsApp no log do WS:
   - `detached frame`
   - `execution context was destroyed`
   - `target closed`

## Ações automáticas
- Reinicia app PM2 fora de `online`
- Reinicia `WebServer` se healthcheck web falhar
- Reinicia `WS-Socket-Server` quando o número de erros críticos novos no log atingir o limiar
- Envia alerta no WhatsApp quando houver restart automático e outros problemas críticos detectados

## Arquivos
- Script: `/home/dev/work/sticker-bot2/scripts/ops/health-watchdog.js`
- Log JSONL: `/home/dev/work/sticker-bot2/storage/logs/health-watchdog.log`
- Estado de leitura incremental do log: `/home/dev/work/sticker-bot2/storage/logs/health-watchdog.state.json`
- Log da execução via cron: `/home/dev/work/sticker-bot2/storage/logs/health-watchdog-cron.log`

## Execução manual
```bash
cd /home/dev/work/sticker-bot2
npm run ops:watchdog
# teste manual de alerta WhatsApp
npm run ops:watchdog:test-alert
```

## Execução contínua (já configurada)
Crontab do usuário `dev`:
```cron
*/2 * * * * cd /home/dev/work/sticker-bot2 && /usr/bin/env node scripts/ops/health-watchdog.js >> /home/dev/work/sticker-bot2/storage/logs/health-watchdog-cron.log 2>&1
```

## Variáveis opcionais
- `HEALTH_WEB_PORT` (default: `3001`)
- `HEALTH_WEBHOOK_PATH` (default: `/webhook/status`)
- `HEALTH_ERROR_SCAN_LINES` (default: `300`)
- `HEALTH_DETACHED_FRAME_THRESHOLD` (default: `3`)
- `HEALTH_ALERT_ENABLED` (default: `true`)
- `HEALTH_ALERT_WHATSAPP_JID` (destino prioritário de alerta, ex: `5511999999999@c.us` ou `1203...@g.us`)
- `HEALTH_ALERT_WS_URL` (default: `ws://127.0.0.1:8765`)
- `HEALTH_ALERT_WS_TOKEN` (default: `dev`)
- `HEALTH_ALERT_COOLDOWN_SEC` (default: `300`, evita spam)

Observação sobre destino de alerta:
- Se `HEALTH_ALERT_WHATSAPP_JID` não estiver definido, o watchdog tenta `ADMIN_NUMBER` e depois `AUTO_SEND_GROUP_ID` como fallback.

## Resposta rápida (SRE runbook)
```bash
pm2 status
pm2 logs WS-Socket-Server --lines 120 --nostream
npm run ops:watchdog
curl -sS http://localhost:3000/webhook/status
```
