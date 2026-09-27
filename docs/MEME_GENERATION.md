# Geração de memes com feedback

## Estado

A primeira fatia está implementada no StickerBot2, mas ainda requer canário real no WhatsApp antes de ser considerada encerrada.

## Fluxo

```text
texto ou áudio
    ↓
transcrição (se áudio)
    ↓
planejamento de prompt
    ↓
Lemonade/Z-Image
    ↓
WebP/figurinha
    ↓
reação do usuário
    ↓
feedback persistido e orientação para próximos prompts
```

## Uso

```text
#criar uma situação curta e engraçada
```

Para áudio, responda a mensagem de áudio com `#criar`.

Reações reconhecidas:

- positivas: `🎯`, `👍`, `❤️`, `🔥`, `😂`, `😍`, `👏`;
- negativas: `👎`, `😐`, `😕`, `😞`, `😡`, `🤮`, `💩`.

Cada usuário possui um voto por meme. Uma nova reação substitui a anterior.

## Persistência

O plugin mantém o banco local `memes.sqlite` fora do Git, com:

- `memes`: prompt, texto original, resultado e contagem positiva;
- `meme_messages`: relação entre mensagem enviada e meme;
- `meme_feedback`: sentimento, emoji e usuário por meme.

Com cinco feedbacks positivos, o meme entra na view `memes_top` e pode influenciar prompts posteriores.

## Limitações atuais

- O feedback é orientação agregada, não treinamento automático do modelo.
- Exemplos são limitados e sanitizados antes de entrar no prompt.
- A geração depende do endpoint Lemonade configurado em `LEMONADE_IMAGE_BASE_URL`.
- O canário real ainda deve confirmar: geração, envio, reação, persistência e efeito na próxima criação.
- A RTX 3070 deve usar resoluções e parâmetros validados pelo ambiente; não presumir que geração direta em 1920×1080 seja segura.

## Validação

```bash
npm run test:unit
npm run test:integration
```

Os testes cobrem classificação, sanitização, wiring e persistência isolada. Eles não substituem o teste real no WhatsApp.
