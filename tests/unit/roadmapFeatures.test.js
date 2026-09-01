const { assert, assertEqual, runTestSuite } = require('../helpers/testUtils');
process.env.CONVERSATION_CONTEXT_TIME_ENABLED='1';
process.env.CONVERSATION_CONTEXT_HUMOR_ENABLED='1';
process.env.CONVERSATION_CONTEXT_SENTIMENT_ENABLED='1';
const { buildContextualDirective } = require('../../src/services/conversationAgent');
const { getReactionAnalytics, getReactionTrends } = require('../../src/database/models/reactions');
const { upsertMediaMetadata, findMediaByMetadata } = require('../../src/database/models/mediaMetadata');
const { db } = require('../../src/database');
const tests=[
 {name:'contextual directive detects humor and frustration without exposing internals',fn:async()=>{const out=buildContextualDirective('kkkk deu errado, estou frustrado');assert(out.includes('humorístico'));assert(out.includes('frustrado'));assert(!out.includes('system'));}},
 {name:'contextual directive includes bounded time context',fn:async()=>{const out=buildContextualDirective('olá');assert(/manhã|tarde|noite|madrugada/.test(out));}},
 {name:'reaction analytics returns bounded aggregate shape',fn:async()=>{const out=await getReactionAnalytics({from:Date.now()-86400000,to:Date.now(),limit:999});assertEqual(typeof out.totalReactions,'number');assert(Array.isArray(out.topMedia));assert(Array.isArray(out.emojiCounts));assertEqual(out.topMedia.length<=50,true);}},
 {name:'reaction trends expose weekly and monthly buckets',fn:async()=>{const out=await getReactionTrends({from:Date.now()-31*86400000,to:Date.now()});assert(Array.isArray(out.weekly));assert(Array.isArray(out.monthly));assert(out.weekly.every(x=>/^\d{4}-W\d{2}$/.test(x.period)));assert(out.monthly.every(x=>/^\d{4}-\d{2}$/.test(x.period)));}},
 {name:'sticker metadata search is separate from public description',fn:async()=>{const row=await new Promise((resolve,reject)=>db.get('SELECT id,description FROM media WHERE nsfw=0 ORDER BY id LIMIT 1',(e,r)=>e?reject(e):resolve(r)));if(!row)return;await upsertMediaMetadata(row.id,{visual_action:'zzacao',emotion:'zzemocao',usage_intent:'zzpesquisa'});const found=await findMediaByMetadata('zzpesquisa',5);assert(found.some(x=>x.id===row.id));assertEqual(found.find(x=>x.id===row.id).description,row.description);await new Promise(resolve=>db.run('DELETE FROM media_metadata WHERE media_id=?',[row.id],resolve));}}
];
if(require.main===module)runTestSuite('Roadmap Feature Tests',tests).then(r=>process.exit(r.failed?1:0));
module.exports={tests};
