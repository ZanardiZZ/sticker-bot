# Sessao: upgrade para sqlite3 6

Data: 2026-03-30

## Estado atual

- Projeto ainda usa `sqlite3` `^5.1.7` em `package.json`.
- Worktree local tem apenas mudanca em `package-lock.json` com updates seguros de dependencias transitivas:
  - `path-to-regexp` `8.3.0 -> 8.4.0`
  - `picomatch` `2.3.1 -> 2.3.2`
  - `brace-expansion` `1.1.12 -> 1.1.13` e `5.0.4 -> 5.0.5`
  - `@wppconnect-team/wppconnect` `1.41.0 -> 1.41.1`
  - `@wppconnect/wa-js` `3.23.1 -> 3.23.2`

## Ambiente observado

- OS: Debian 12 (bookworm)
- `glibc`: 2.36
- Node: `v22.22.2`
- npm: `10.9.7`
- Toolchain presente:
  - `python3`
  - `make`
  - `g++`

## Resultado dos testes com sqlite3 6

### Tentativa 1: install normal

Comando testado:

```bash
npm install sqlite3@6.0.1
```

Resultado:

- instalacao concluiu
- `npm run smoke` passou
- `npm run check` falhou ao carregar o modulo nativo

Erro principal:

```text
Error: /lib/x86_64-linux-gnu/libm.so.6: version `GLIBC_2.38' not found
```

Conclusao:

- o binario precompilado baixado por `sqlite3@6.0.1` exige `glibc >= 2.38`
- a base atual Debian 12 com `glibc 2.36` nao suporta esse binario

### Tentativa 2: build local do pacote

Comando testado fora do repositorio:

```bash
npm install sqlite3@6.0.1 --build-from-source
```

Resultado:

- compilou com sucesso nesta mesma maquina

Conclusao:

- o bloqueio nao e de codigo do projeto
- o bloqueio e do binario precompilado
- com compilacao local, `sqlite3@6.0.1` e viavel mesmo sem trocar o SO

## Uso atual de sqlite3 no projeto

Pontos principais:

- `src/database/connection.js`
- `src/services/databaseHandler.js`
- `src/plugins/memeGenerator.js`
- scripts em `scripts/`
- testes em `tests/`

Observacao:

- o uso e amplo, mas simples, baseado em `require('sqlite3').verbose()` e `new sqlite3.Database(...)`
- nao apareceu indicio de quebra de API no codigo durante a analise

## Plano recomendado para subir a versao

### Caminho 1 - recomendado

Padronizar `sqlite3@6.0.1` com build local do addon:

1. atualizar `package.json` para `sqlite3@^6.0.1`
2. adicionar `engines.node` em `package.json`
3. documentar requisitos de build:
   - `python3`
   - `make`
   - `g++`
4. ajustar instalacao, CI e deploy para usar build local:

```bash
npm_config_build_from_source=true npm ci
```

5. validar:
   - `npm run smoke`
   - `npm run check`
   - boot via PM2
   - leitura/escrita no banco
   - WAL e migrations

### Caminho 2 - alternativo

Subir o host para base com `glibc >= 2.38` e usar o binario precompilado.

Exemplo pratico:

- Debian 13 tende a resolver esse ponto se vier com `glibc` nova o bastante

Tradeoff:

- mais custo operacional
- menor dependencia de toolchain local no install

## Saldo do npm audit no estado viavel atual

Depois dos updates seguros no lockfile e sem `sqlite3@6`:

- total: `16`
- `7 high`
- `5 moderate`
- `4 low`

Restantes mais relevantes:

- `sqlite3` e cadeia nativa de install
- `@tensorflow/tfjs-node` e cadeia nativa de install
- `@wppconnect-team/wppconnect` e transitivas moderadas

## Proximo passo apos atualizar a maquina

1. confirmar versao nova do sistema e `glibc`
2. testar novamente:

```bash
npm install sqlite3@6.0.1
npm run smoke
npm run check
```

3. se ainda houver problema com binario precompilado, usar:

```bash
npm_config_build_from_source=true npm install sqlite3@6.0.1
```

4. se passar, consolidar:
   - update em `package.json`
   - update em `package-lock.json`
   - docs de install/deploy

## Revalidacao apos update do sistema

Ambiente rechecado depois do upgrade da maquina:

- OS: Debian 13
- `glibc`: 2.41
- Node: `v22.22.2`
- npm: `10.9.7`

Teste isolado fora do repositorio:

```bash
npm install sqlite3@6.0.1
node -e "const sqlite3=require('sqlite3'); const db=new sqlite3.Database(':memory:')"
```

Resultado:

- instalacao normal concluiu
- modulo nativo carregou sem erro de `GLIBC_2.38`
- banco em memoria abriu normalmente

Validacao no projeto:

```bash
npm install sqlite3@6.0.1
npm run smoke
npm run check
```

Resultado:

- `package.json` atualizado para `sqlite3@^6.0.1`
- `npm run smoke` passou
- `npm run check` passou
- suite unitária: `181/181` testes ok

Conclusao final:

- agora podemos fazer o update de `sqlite3` no projeto sem forcar `build-from-source`
- o bloqueio anterior era exclusivamente a `glibc 2.36`
