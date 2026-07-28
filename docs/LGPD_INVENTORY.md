# Inventário inicial de privacidade e LGPD

> Documento técnico de trabalho. Não substitui revisão jurídica nem a política pública final.

## Escopo

Site público do StickerBot/Sticker Browser, servido pelo WebServer do projeto `sticker-bot2`. O inventário foi feito sobre o código e o domínio em execução; valores de segredos e dados de usuários não são registrados aqui.

## Dados e finalidades identificados

| Categoria | Dados/artefatos | Onde aparece | Finalidade observada | Situação |
|---|---|---|---|---|
| Navegação técnica | IP, rota, método, status, duração, referer e user-agent | `request_log`, quando analytics interno está habilitado | segurança, diagnóstico e métricas operacionais | Confirmado no código; retenção ainda não documentada |
| Sessão técnica | `connect.sid` | `express-session` | CAPTCHA, CSRF e estado temporário | Confirmado; sessão anônima foi ajustada nesta etapa |
| Conta | usuário, hash de senha, e-mail, status, função e timestamps | tabela `users` | autenticação, aprovação e gestão de acesso | Confirmado |
| WhatsApp | telefone e vínculo com `dm_users`/contatos | cadastro e banco do bot | verificar relacionamento com o bot e habilitar recursos | Confirmado; finalidade e retenção precisam ser explicitadas |
| Segurança | regras de IP e motivo | tabela `ip_rules` | permitir/bloquear origem e proteção contra abuso | Confirmado; retenção precisa ser definida |
| Conteúdo | mídia, descrição, tags e metadados | banco e armazenamento de mídia | catálogo e envio da figurinha | Confirmado; origem, direitos e remoção precisam de processo |
| Analytics externo | script Umami, identificador do site e eventos | páginas públicas/admin | medir utilização | Confirmado; carregamento atual ocorre sem escolha explícita |
| E-mail transacional | e-mail e token de confirmação | cadastro e serviço de e-mail | confirmar a conta | Confirmado |

## Cookies e armazenamento

- `connect.sid` é emitido pelo Express.
- A autenticação usa `__Host-sid` em produção e fallback compatível `sid`.
- Há cookie de debug condicionado a `ADMIN_AUTOLOGIN_DEBUG=1`; esse modo não deve ficar ativo em produção.
- O Umami é carregado por script de terceiro nas páginas públicas e administrativas; consentimento ainda é pendência.

## Controles já observados

- Senhas são armazenadas como hash bcrypt.
- Cookies de autenticação usam `HttpOnly`, `SameSite=Lax` e `Secure` em produção.
- CSRF está configurado para métodos mutáveis.
- Rotas administrativas exigem autenticação administrativa.
- A API de sticker NSFW exige login.
- Segredos de produção ficam fora do Git rastreado.

## Lacunas prioritárias

1. Identificar publicamente o controlador/responsável e canal de contato para direitos do titular.
2. Publicar política de privacidade específica, com finalidades, bases legais a validar, compartilhamentos, retenção, segurança e direitos.
3. Definir a política do Umami; não tratar o carregamento atual como consentimento obtido.
4. Implementar escolha granular para analytics não essenciais, sem impedir a navegação básica.
5. Definir retenção para `request_log`, `ip_rules`, contas, tokens de confirmação, contatos e mídias.
6. Criar fluxo de atendimento para acesso, correção, eliminação, oposição/revogação e informação.
7. Definir processo para remoção de figurinha/conteúdo e solicitações de terceiros.
8. Revisar transferências envolvendo analytics, e-mail, hospedagem, Cloudflare e futuro provedor WhatsApp.
9. Minimizar logs de cadastro/CAPTCHA, que hoje podem conter identificadores e valores transitórios.

## Primeira correção técnica aplicada

A sessão Express foi alterada para `saveUninitialized: false`. Uma visita anônima que apenas navega no catálogo não cria automaticamente `connect.sid`; a sessão continua sendo criada quando necessária para CAPTCHA, CSRF ou autenticação.

## Decisões pendentes

- Nome/razão social ou identificação pública do responsável.
- E-mail/canal oficial para privacidade e direitos do titular.
- Países/serviços que recebem dados e contratos aplicáveis.
- Prazos de retenção por categoria.
- Política de analytics e preferência entre opt-in, opt-out ou medição agregada sem cookies, sujeita à validação jurídica.

## Próxima etapa recomendada

Com os dados acima definidos, criar `/privacidade`, link persistente nas páginas públicas, gerenciador de preferências de analytics e testes que confirmem: sem consentimento não há analytics não essencial; login/cadastro continuam funcionais; e o canal de direitos do titular está acessível.
