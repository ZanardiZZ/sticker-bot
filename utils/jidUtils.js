const { jidDecode } = require('@whiskeysockets/baileys');

/**
 * Decodifica um JID em suas partes componentes
 * @param {string} jid - O JID a ser decodificado
 * @returns {Object|null} Objeto com user, server, etc ou null se inválido
 */
function decodeJid(jid) {
    if (!jid) return null;
    return jidDecode(jid);
}

/**
 * Verifica se dois JIDs são do mesmo usuário
 * @param {string} jid1 
 * @param {string} jid2 
 * @returns {boolean}
 */
function areJidsSameUser(jid1, jid2) {
    return jidDecode(jid1)?.user === jidDecode(jid2)?.user;
}

/**
 * Verifica se o JID é Meta AI
 * @param {string} jid 
 * @returns {boolean}
 */
function isJidMetaAI(jid) {
    return jid?.endsWith('@bot');
}

/**
 * Verifica se o JID é um usuário PN (phone number)
 * @param {string} jid 
 * @returns {boolean}
 */
function isPnUser(jid) {
    return jid?.endsWith('@s.whatsapp.net');
}

/**
 * Verifica se o JID é um usuário LID
 * @param {string} jid 
 * @returns {boolean}
 */
function isLidUser(jid) {
    return jid?.endsWith('@lid');
}

/**
 * Verifica se o JID é um broadcast
 * @param {string} jid 
 * @returns {boolean}
 */
function isJidBroadcast(jid) {
    return jid?.endsWith('@broadcast');
}

/**
 * Verifica se o JID é um grupo
 * @param {string} jid 
 * @returns {boolean}
 */
function isJidGroup(jid) {
    return jid?.endsWith('@g.us');
}

/**
 * Verifica se o JID é status broadcast
 * @param {string} jid 
 * @returns {boolean}
 */
function isJidStatusBroadcast(jid) {
    return jid === 'status@broadcast';
}

/**
 * Verifica se o JID é newsletter
 * @param {string} jid 
 * @returns {boolean}
 */
function isJidNewsletter(jid) {
    return jid?.endsWith('@newsletter');
}

/**
 * Verifica se o JID é hosted PN
 * @param {string} jid 
 * @returns {boolean}
 */
function isJidHostedPnUser(jid) {
    return jid?.endsWith('@hosted');
}

/**
 * Verifica se o JID é hosted LID
 * @param {string} jid 
 * @returns {boolean}
 */
function isJidHostedLidUser(jid) {
    return jid?.endsWith('@hosted.lid');
}

/**
 * Obtém o ID preferido do usuário (LID se disponível, senão PN)
 * @param {Object} sock - Instância do socket Baileys
 * @param {string} jid - JID do usuário
 * @returns {Promise<string>} ID preferido
 */
async function getPreferredUserId(sock, jid) {
    if (!jid) return null;
    
    // Se já é LID, retorna como está
    if (isLidUser(jid)) {
        return jid;
    }
    
    // Se é PN, tenta obter o LID correspondente
    if (isPnUser(jid)) {
        try {
            const lid = await sock.signalRepository.lidMapping.getLIDForPN(jid);
            return lid || jid; // Retorna LID se encontrado, senão mantém PN
        } catch (error) {
            console.log(`[JID] Erro ao obter LID para ${jid}:`, error.message);
            return jid;
        }
    }
    
    return jid;
}

/**
 * Obtém o número de telefone para um LID
 * @param {Object} sock - Instância do socket Baileys
 * @param {string} lid - LID do usuário
 * @returns {Promise<string|null>} Número de telefone ou null
 */
async function getPhoneNumberForLid(sock, lid) {
    if (!isLidUser(lid)) return null;
    
    try {
        return await sock.signalRepository.lidMapping.getPNForLID(lid);
    } catch (error) {
        console.log(`[JID] Erro ao obter PN para ${lid}:`, error.message);
        return null;
    }
}

/**
 * Normaliza um JID para uso consistente no sistema
 * @param {string} jid 
 * @returns {string}
 */
function normalizeJid(jid) {
    if (!jid) return null;

    let raw = jid;

    if (typeof raw === 'object') {
        // Baileys pode retornar objetos com diferentes propriedades contendo o JID real
        if (typeof raw.jid === 'string') {
            raw = raw.jid;
        } else if (typeof raw.id === 'string') {
            raw = raw.id;
        } else if (typeof raw.user === 'string') {
            const server = typeof raw.server === 'string' ? raw.server : (typeof raw.domain === 'string' ? raw.domain : '');
            raw = server ? `${raw.user}@${server}` : raw.user;
        } else if (typeof raw.toString === 'function' && raw.toString !== Object.prototype.toString) {
            raw = raw.toString();
        } else {
            return null;
        }
    }

    if (typeof raw !== 'string') {
        raw = String(raw);
    }

    const cleaned = raw.trim();
    if (!cleaned) return null;

    return cleaned.toLowerCase();
}

module.exports = {
    decodeJid,
    areJidsSameUser,
    isJidMetaAI,
    isPnUser,
    isLidUser,
    isJidBroadcast,
    isJidGroup,
    isJidStatusBroadcast,
    isJidNewsletter,
    isJidHostedPnUser,
    isJidHostedLidUser,
    getPreferredUserId,
    getPhoneNumberForLid,
    normalizeJid
};
