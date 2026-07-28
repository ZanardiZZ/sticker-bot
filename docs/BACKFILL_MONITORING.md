# Backfill de metadados com monitoramento

## Objetivo

Processar mídias históricas em `512×512`, preenchendo apenas `media_metadata`. O campo público `media.description` não pode ser alterado.

## Componentes

- Worker por item: `scripts/backfill_metadata_one.js`;
- controlador no host Proxmox: `<HOST_PATH>/stickerbot-backfill-host-20260719.sh`;
- resultados: `<HOST_PATH>/stickerbot-backfill-results-20260719.jsonl`;
- log operacional: `<HOST_PATH>/stickerbot-backfill-host-20260719.log`.

O controlador roda no host, porque o CT138 não possui autenticação SSH de retorno para o host. Ele chama o worker via `pct exec 138`.

## Monitoramento

Antes de cada item, o host verifica:

- RAM disponível;
- swap livre;
- load average;
- temperatura/utilização/VRAM da GPU;
- `/health` do CT153;
- presença e prontidão do Qwen3-VL-4B;
- `memory.events` do CT153.

O lote pausa quando:

- RAM disponível fica abaixo de 2 GiB;
- swap livre fica abaixo de 512 MiB;
- load ultrapassa duas vezes o número de CPUs;
- VRAM ultrapassa 90%;
- GPU ultrapassa 82 °C;
- o modelo deixa de estar pronto;
- o host ou o router apresentam falhas de transporte.

## Timeout

`BACKFILL_OPENAI_TIMEOUT_MS` é aplicado somente ao worker de backfill. O fluxo normal do StickerBot não usa essa variável e não sofre alteração de usabilidade.

O worker também usa `OPENAI_MAX_RETRIES=0` para não esconder uma falha longa dentro de retries automáticos. Cada item possui checkpoint próprio e pode ser repetido com segurança.

## Resultado do piloto de 2026-07-19

- 20 itens haviam sido processados antes do controlador;
- 12 itens foram concluídos com monitoramento do host;
- total persistido: 32 metadados;
- 0 descrições públicas alteradas;
- 18 itens do alvo de 50 permanecem pendentes;
- o lote foi interrompido quando o host apresentou queda contínua de RAM disponível e swap livre.

Diagnóstico observado:

- CT153 saudável no momento da inspeção;
- Qwen3-VL-4B com inferências de aproximadamente 1,8–2,5 s nos logs;
- histórico do cgroup com `oom_kill=6` e `sock_throttled=4343`;
- host com swap quase cheia durante o lote.

Não iniciar novo lote enquanto o host não recuperar margem de memória/swap.
