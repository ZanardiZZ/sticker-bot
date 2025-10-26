const pm2 = require('pm2');
const fs = require('fs');
const axios = require('axios');
const { safeReply } = require('../../utils/safeMessaging');
const { withTyping } = require('../../utils/typingIndicator');
const { normalizeJid } = require('../../utils/jidUtils');

const DEFAULT_LOG_LINES = Number(process.env.GITHUB_ISSUE_LOG_LINES || 50);
const AUTHORIZED_LID = normalizeJid(process.env.GITHUB_ISSUE_ALLOWED_LID || '178108149825760@lid');
const GITHUB_REPO = process.env.GITHUB_ISSUE_REPO || 'ZanardiZZ/sticker-bot';
const GITHUB_ASSIGNEES = (process.env.GITHUB_ISSUE_ASSIGNEES || 'copilot')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

function sanitizeTripleBackticks(text = '') {
  return text.replace(/```/g, '``\`');
}

function extractIssueDescription(rawText = '') {
  return rawText.replace(/^#[^\s]+\s*/i, '').trim();
}

async function pm2Connect() {
  return new Promise((resolve, reject) => {
    pm2.connect(err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function pm2Describe(processId) {
  return new Promise((resolve, reject) => {
    pm2.describe(processId, (err, processDescription) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(processDescription);
    });
  });
}

async function readTail(filePath, maxLines) {
  if (!filePath) {
    throw new Error('Caminho de log não definido');
  }

  try {
    const handle = await fs.promises.open(filePath, 'r');
    try {
      const stats = await handle.stat();
      const fileSize = stats.size;
      const chunkSize = 64 * 1024;
      let buffer = '';
      let position = fileSize;

      while (position > 0 && buffer.split(/\r?\n/).length <= maxLines + 1) {
        const readSize = Math.min(chunkSize, position);
        position -= readSize;
        const readResult = await handle.read({
          buffer: Buffer.alloc(readSize),
          offset: 0,
          length: readSize,
          position
        });
        const chunk = readResult.buffer.toString('utf8', 0, readResult.bytesRead);
        buffer = chunk + buffer;
      }

      const lines = buffer.trimEnd().split(/\r?\n/);
      return lines.slice(-maxLines).join('\n');
    } finally {
      await handle.close();
    }
  } catch (error) {
    throw new Error(`Falha ao ler ${filePath}: ${error.message}`);
  }
}

async function fetchProcessLogs(processId, maxLines) {
  const description = await pm2Describe(processId);
  if (!Array.isArray(description) || description.length === 0) {
    throw new Error(`Processo ${processId} não encontrado`);
  }

  const [processInfo] = description;
  const pm2Env = processInfo?.pm2_env || {};
  const stdoutPath = pm2Env.pm_out_log_path;
  const stderrPath = pm2Env.pm_err_log_path;

  const stdout = stdoutPath
    ? await readTail(stdoutPath, maxLines).catch(error => ({ error: error.message }))
    : { error: 'Caminho de stdout não definido' };
  const stderr = stderrPath && stderrPath !== stdoutPath
    ? await readTail(stderrPath, maxLines).catch(error => ({ error: error.message }))
    : (stderrPath ? await readTail(stderrPath, maxLines).catch(error => ({ error: error.message })) : null);

  return {
    name: processInfo.name || `pm2-${processId}`,
    processId,
    stdout: typeof stdout === 'string' ? { content: stdout, path: stdoutPath } : { path: stdoutPath, error: stdout.error },
    stderr: stderr == null
      ? null
      : (typeof stderr === 'string'
        ? { content: stderr, path: stderrPath }
        : { path: stderrPath, error: stderr.error })
  };
}

function buildIssueBody({ description, reporterId, serverLogs, clientLogs, maxLines }) {
  const parts = [];
  parts.push('## Report criado via Sticker Bot');
  parts.push('');
  parts.push(`**Reporter:** ${reporterId || 'desconhecido'}`);
  parts.push(`**Linhas de log coletadas:** ${maxLines}`);
  parts.push('');
  parts.push('**Descrição reportada:**');
  parts.push('');
  parts.push(description || '_não informado_');
  parts.push('');

  const logSections = [
    { label: 'Bot Server (pm2 id 0)', data: serverLogs },
    { label: 'Bot Client (pm2 id 1)', data: clientLogs }
  ];

  for (const section of logSections) {
    const { label, data } = section;
    parts.push(`<details>`);
    parts.push(`<summary>${label}${data?.name ? ` - ${data.name}` : ''}</summary>`);
    parts.push('');

    if (!data) {
      parts.push('_Logs indisponíveis_');
      parts.push('</details>');
      parts.push('');
      continue;
    }

    if (data.stdout) {
      parts.push(`**stdout** (${data.stdout.path || 'desconhecido'})`);
      parts.push('');
      parts.push('```');
      parts.push(sanitizeTripleBackticks(data.stdout.content || data.stdout.error || 'Sem dados.'));
      parts.push('```');
      parts.push('');
    }

    if (data.stderr) {
      parts.push(`**stderr** (${data.stderr.path || 'desconhecido'})`);
      parts.push('');
      parts.push('```');
      parts.push(sanitizeTripleBackticks(data.stderr.content || data.stderr.error || 'Sem dados.'));
      parts.push('```');
      parts.push('');
    }

    parts.push('</details>');
    parts.push('');
  }

  return parts.join('\n');
}

async function createGithubIssue({ title, body, token, assignees = GITHUB_ASSIGNEES }) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/issues`;
  const headers = {
    'User-Agent': 'sticker-bot-issue-reporter',
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`
  };

  const payload = { title, body };
  if (Array.isArray(assignees) && assignees.length > 0) {
    payload.assignees = assignees;
  }

  const response = await axios.post(url, payload, { headers });
  return response.data;
}

function buildIssueTitle(description) {
  const base = description || 'Issue reportada via WhatsApp';
  const trimmed = base.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= 70) {
    return `Sticker Bot: ${trimmed}`;
  }
  return `Sticker Bot: ${trimmed.slice(0, 67)}...`;
}

async function handleIssueCommand(client, message, chatId, params = [], context = {}) {
  const requesterId = normalizeJid(context?.resolvedSenderId || '');
  if (requesterId !== AUTHORIZED_LID) {
    await safeReply(client, chatId, 'Você não tem permissão para usar este comando.', message);
    return true;
  }

  const rawText = message?.body || message?.caption || '';
  const description = extractIssueDescription(rawText);

  if (!description) {
    await safeReply(client, chatId, 'Formato inválido. Use *#issue* seguido de uma breve descrição do problema.', message);
    return true;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_ISSUE_TOKEN;
  if (!token) {
    await safeReply(client, chatId, 'Token do GitHub não configurado. Configure GITHUB_TOKEN ou GITHUB_ISSUE_TOKEN.', message);
    return true;
  }

  const logLines = Number.isFinite(DEFAULT_LOG_LINES) && DEFAULT_LOG_LINES > 0 ? DEFAULT_LOG_LINES : 50;

  try {
    return await withTyping(client, chatId, async () => {
      let serverLogs = null;
      let clientLogs = null;

      try {
        await pm2Connect();
        try {
          serverLogs = await fetchProcessLogs(0, logLines);
        } catch (error) {
          serverLogs = null;
          console.error('[ISSUE] Falha ao coletar logs do servidor:', error.message);
        }

        try {
          clientLogs = await fetchProcessLogs(1, logLines);
        } catch (error) {
          clientLogs = null;
          console.error('[ISSUE] Falha ao coletar logs do cliente:', error.message);
        }
      } catch (connectionError) {
        console.error('[ISSUE] Falha ao conectar ao PM2:', connectionError.message);
      } finally {
        try {
          pm2.disconnect();
        } catch (disconnectError) {
          console.error('[ISSUE] Erro ao desconectar do PM2:', disconnectError.message);
        }
      }

      const issueBody = buildIssueBody({
        description,
        reporterId: requesterId,
        serverLogs,
        clientLogs,
        maxLines: logLines
      });

      let issue;
      let responseNote = '';
      try {
        issue = await createGithubIssue({
          title: buildIssueTitle(description),
          body: issueBody,
          token
        });
      } catch (error) {
        const apiError = error?.response?.data?.message || error.message;
        const status = error?.response?.status;
        const errors = error?.response?.data?.errors;
        const assigneeValidationFailed =
          status === 422 && Array.isArray(errors) && errors.some(err => {
            const field = err?.field || '';
            const code = err?.code || '';
            const msg = (err?.message || '').toLowerCase();
            return field === 'assignees' || code === 'invalid' || code === 'invalid_assignee' || msg.includes('assignee');
          });

        if (assigneeValidationFailed && GITHUB_ASSIGNEES.length > 0) {
          console.warn('[ISSUE] GitHub rejeitou os assignees configurados:', JSON.stringify(errors));
          try {
            issue = await createGithubIssue({
              title: buildIssueTitle(description),
              body: issueBody,
              token,
              assignees: []
            });
            responseNote = ' (sem atribuição — GitHub rejeitou os responsáveis configurados)';
          } catch (retryError) {
            const retryMsg = retryError?.response?.data?.message || retryError.message;
            console.error('[ISSUE] Falha ao criar issue após remover assignees:', retryMsg);
            await safeReply(client, chatId, `Não foi possível criar a issue no GitHub: ${retryMsg}`, message);
            return true;
          }
        } else {
          console.error('[ISSUE] Falha ao criar issue no GitHub:', apiError);
          if (Array.isArray(errors) && errors.length) {
            console.error('[ISSUE] Detalhes do erro GitHub:', JSON.stringify(errors));
          }
          await safeReply(client, chatId, `Não foi possível criar a issue no GitHub: ${apiError}`, message);
          return true;
        }
      }

      const issueUrl = issue?.html_url || issue?.url || 'Issue criada, mas URL não retornada.';
      await safeReply(client, chatId, `Issue criada com sucesso: ${issueUrl}${responseNote}`, message);
      return true;
    });
  } catch (error) {
    console.error('[ISSUE] Erro inesperado ao processar comando:', error.message);
    await safeReply(client, chatId, 'Ocorreu um erro ao processar sua requisição.', message);
    return true;
  }
}

module.exports = {
  handleIssueCommand
};
