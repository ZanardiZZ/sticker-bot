# Mercado Pago — Checkout Transparente via Orders

A Fase 3 usa o Checkout Transparente via Orders do Mercado Pago, inicialmente em sandbox.

## Fluxo

```text
DM pública envia #ID
  -> backend gera token opaco de 15 minutos
  -> site /acesso.html?token=...
  -> Card Payment Brick ou PIX
  -> backend cria POST /v1/orders
  -> Mercado Pago processa
  -> webhook HTTPS
  -> backend consulta GET /v1/orders/{id}
  -> valida referência, valor e status
  -> cria/renova dm_entitlements por 30 dias
```

O navegador nunca é a fonte final de confirmação. O acesso só é concedido após a confirmação server-to-server.

## Variáveis do `.env`

Os nomes abaixo já foram adicionados ao ambiente. Preencha primeiro com as credenciais de teste:

```env
MERCADOPAGO_ENVIRONMENT=sandbox
MERCADOPAGO_PUBLIC_KEY=<public-key-de-teste>
MERCADOPAGO_ACCESS_TOKEN=<access-token-de-teste>
MERCADOPAGO_WEBHOOK_SECRET=<segredo-configurado-no-painel-ou-vazio-no-sandbox-inicial>
MERCADOPAGO_ACCESS_AMOUNT_CENTS=<valor-em-centavos>
PUBLIC_DM_ENTITLEMENT_DAYS=30
```

Não coloque esses valores no Git, no frontend ou em mensagens do WhatsApp. O Access Token é usado somente pelo backend. O valor deve ser definido explicitamente; sem ele o checkout permanece desabilitado.

## URL do webhook

Configure no painel do app Mercado Pago:

```text
https://figurinhas.zanardizz.uk/api/payments/mercadopago/webhook
```

O endpoint aceita somente eventos com Order identificável e assinatura válida quando `MERCADOPAGO_WEBHOOK_SECRET` estiver configurado. Em produção, a assinatura é obrigatória por configuração do código.

## Rotas

- `GET /acesso.html?token=...` — página do checkout.
- `GET /api/payments/mercadopago/config?token=...` — configuração pública e validade do token.
- `POST /api/payments/mercadopago/order` — criação de Order para cartão ou PIX; protegido por CSRF.
- `GET /api/payments/mercadopago/status?token=...` — status não sensível do checkout.
- `POST /api/payments/mercadopago/webhook` — notificação server-to-server.
- `GET /api/admin/payments/summary` — resumo administrativo protegido.

## Segurança e idempotência

- Tokens de acesso são armazenados somente como SHA-256 no banco.
- Orders usam `X-Idempotency-Key` exclusivo.
- Webhooks repetidos não criam novos entitlements.
- O valor confirmado é comparado ao valor local antes da liberação.
- PAN, CVV e cartão não são armazenados.
- O status do frontend é provisório; a API do Mercado Pago é consultada no webhook.
- Entitlements ficam separados de `dm_users` e expiram automaticamente pela consulta do gate.
- Reembolso, chargeback e rejeição são persistidos como estados que não mantêm acesso aprovado.

## Teste sandbox

1. Preencha as variáveis de sandbox e reinicie somente `WebServer` e `Bot-Client` com `--update-env`.
2. Use uma conta compradora de teste compatível com a conta vendedora de teste.
3. Valide PIX, cartão aprovado, cartão recusado, webhook duplicado e webhook com assinatura inválida.
4. Verifique `/api/admin/payments/summary` autenticado.
5. Só depois configure as credenciais de produção e o webhook de produção.

O teste automatizado local não chama o Mercado Pago real: ele simula a API para validar Order, idempotência, entitlement e divergência de valor.

## Mudança para produção

Não basta trocar o Access Token. Antes da troca:

- substituir `MERCADOPAGO_ENVIRONMENT=production`;
- inserir public key e Access Token de produção diretamente no `.env` do servidor;
- configurar o segredo real de assinatura;
- confirmar o valor em centavos;
- configurar a URL HTTPS do webhook no modo de produção;
- fazer pagamento controlado e conferir a liberação;
- manter backup reversível do `.env`, sem expor seu conteúdo.
