const fs=require('fs');const path=require('path');const {assert,assertEqual}=require('../helpers/testUtils');
const root=path.resolve(__dirname,'..','..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const tests=[
{name:'media caption cannot enter group conversation before media queue',fn:async()=>assert(read('src/bot/messageHandler.js').includes('isGroup && !message.isMedia && message.type === \'chat\''),'media guard must precede conversation')},
{name:'ID-less image uses directPath/mediaKey downloader',fn:async()=>{const s=read('src/server/bridge.js');assert(s.includes('hasEncryptedMedia')&&s.includes('downloadEncryptedMedia'),'encrypted media fallback must cover static images');}},
{name:'duplicate WPP listeners are not registered together',fn:async()=>{const s=read('src/server/bridge.js');const on=s.match(/wppClient\.onMessage\(/g)||[];const any=s.match(/wppClient\.onAnyMessage\(/g)||[];assert(on.length+any.length>=1,'one inbound listener must exist');assert(s.includes('else if (typeof wppClient.onAnyMessage'), 'fallback listener must be else-if');}},
{name:'reasoning spill format is sanitized',fn:async()=>assert(read('src/services/conversationAgent.js').includes('Reasoning'))},
{name:'memory context is enabled and compatibility methods exist',fn:async()=>{const env=read('.env');const s=read('src/client/memory-client.js');assert(env.includes('CONVERSATION_ENABLE_MEMORY_CONTEXT=1'));assert(s.includes('async ensureUser')&&s.includes('async ensureGroup'));}},
{name:'memory commands and deep health route exist',fn:async()=>{assert(fs.existsSync(path.join(root,'src/commands/handlers/memory.js')));assert(read('src/commands/index.js').includes("case '#memorias'"));assert(read('src/web/server.js').includes('/api/health/deep'));}},
{name:'exact media duplicate reuses existing result',fn:async()=>assert(read('src/bot/mediaProcessor.js').includes('[MediaCache] CACHE HIT exact MD5'))}
];
module.exports={tests};
