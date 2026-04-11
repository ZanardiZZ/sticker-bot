# Intent Profiling + Defensive Tone Guardrails

## Objetivo
Personalizar resposta por intenção recorrente do usuário (ex.: teste adversarial), sem permitir ataque pessoal explícito.

## Como funciona
1. `memory-client` detecta sinais heurísticos de intenção por mensagem.
2. Salva sinal em:
   - fato soft: `soft:intent/<intent>`
   - evento: `type=user_intent_signal`
3. `buildContext()` agrega perfil por usuário em `userIntentProfiles`.
4. `conversationAgent` ativa modo defensivo quando:
   - `topIntent === adversarial_testing`
   - `confidence >= CONVERSATION_ADVERSARIAL_INTENT_THRESHOLD`

## Intenções suportadas
- `adversarial_testing`
- `playful_trolling`
- `builder_collab`
- `normal_use`

## Variáveis de ambiente

### `CONVERSATION_DEFENSIVE_TONE_ENABLED`
- `1`: liga adaptação de tom defensivo por perfil
- `0`: desliga adaptação

### `CONVERSATION_USER_ATTACK_GUARDRAILS`
- `1`: guardrails ativos (RECOMENDADO)
  - bloqueia insulto direto, humilhação, ataque pessoal, ameaça e palavrão
  - se o LLM gerar ataque, substitui por resposta técnica segura
- `0`: guardrails de estilo relaxados
  - mantém tom mais provocativo, porém ainda com limite mínimo profissional
  - NÃO é modo de abuso irrestrito

### `CONVERSATION_ADVERSARIAL_INTENT_THRESHOLD`
- Faixa: `0.3` a `0.95`
- Default: `0.58`
- Controla quão fácil é entrar em modo defensivo

## Comportamento de fallback de guardrail
Quando guardrail detecta ataque ao usuário na saída do LLM:
- resposta final enviada: `Limite atingido. Mantendo resposta técnica: tentativa bloqueada.`
- log: `reason_code=guardrail_user_attack_block`

## Notas de segurança
- Modo defensivo ≠ hostilidade abusiva.
- O sistema foi desenhado para firmeza e contenção, não para assédio.
- Se quiser endurecer, ajuste limiar e estilo, não remova limites éticos básicos.
