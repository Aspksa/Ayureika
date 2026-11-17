"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {DatabaseSync}=require("node:sqlite");
const dataDir=path.join(__dirname,"data");
fs.mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,"memory.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS tool_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
db.exec("CREATE TABLE IF NOT EXISTS memory_vectors (id TEXT NOT NULL, model TEXT NOT NULL, vector TEXT NOT NULL, PRIMARY KEY(id,model))");
const vectorUpsert=db.prepare("INSERT INTO memory_vectors(id,model,vector) VALUES (?,?,?) ON CONFLICT(id,model) DO UPDATE SET vector=excluded.vector");
const vectorRows=db.prepare("SELECT m.id,m.content,m.created_at,v.vector FROM memories m JOIN memory_vectors v ON v.id=m.id WHERE v.model=? LIMIT 500");
const missingRows=db.prepare("SELECT m.id,m.content FROM memories m LEFT JOIN memory_vectors v ON m.id=v.id AND v.model=? WHERE v.id IS NULL LIMIT ?");
function validateVector(v){if(!Array.isArray(v)||v.length<2||v.length>4096||v.some(n=>typeof n!=="number"||!Number.isFinite(n)))throw Error("Некорректный вектор");return v;}
function putVector(id,model,vector){if(!/^[a-f0-9]{64}$/.test(id)||typeof model!=="string"||!model)throw Error("Неверные параметры");vectorUpsert.run(id,model,JSON.stringify(validateVector(vector)));}
function missingVectors(model,limit=20){return missingRows.all(model,Math.min(100,Math.max(1,limit)));}
function semantic(model,query,limit=5){const q=validateVector(query);const qn=Math.hypot(...q);if(!qn)return [];return vectorRows.all(model).map(row=>{const v=JSON.parse(row.vector);if(v.length!==q.length)return null;const norm=Math.hypot(...v);if(!norm)return null;const score=v.reduce((n,x,i)=>n+x*q[i],0)/(norm*qn);return {id:row.id,content:row.content,created_at:row.created_at,score};}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,limit);}
const insert=db.prepare("INSERT OR IGNORE INTO memories(id,content) VALUES (?,?)");
const searchStmt=db.prepare("SELECT id,content,created_at FROM memories WHERE content LIKE ? ESCAPE '\\' ORDER BY created_at DESC LIMIT ?");
const listStmt=db.prepare("SELECT id,content,created_at FROM memories ORDER BY created_at DESC LIMIT ?");
const deleteStmt=db.prepare("DELETE FROM memories WHERE id=?");
const auditStmt=db.prepare("INSERT INTO tool_audit(name,input,output) VALUES (?,?,?)");
const logsStmt=db.prepare("SELECT id,name,input,output,created_at FROM tool_audit ORDER BY id DESC LIMIT 50");
function normalize(value){if(typeof value!=="string")throw Error("Ожидается текст");const text=value.trim();if(!text||text.length>4000)throw Error("Текст должен содержать от 1 до 4000 символов");return text;}
function remember(value){const content=normalize(value);const id=crypto.createHash("sha256").update(content.toLocaleLowerCase("ru")).digest("hex");insert.run(id,content);return {id,content};}
function search(query,limit=10){const q=normalize(query).replace(/[\\%_]/g,"\\$&");return searchStmt.all("%"+q+"%",Math.min(30,Math.max(1,Number(limit)||10)));}
function relevant(query,limit=5){
 const words=[...new Set(normalize(query).toLocaleLowerCase("ru").match(/[\p{L}\p{N}]{3,}/gu)||[])].slice(0,12);
 if(!words.length)return [];
 const candidates=listStmt.all(100);
 return candidates.map(row=>{const hay=row.content.toLocaleLowerCase("ru");const score=words.reduce((n,w)=>n+(hay.includes(w)?1:0),0);return {...row,score};})
 .filter(row=>row.score>0).sort((a,b)=>b.score-a.score||b.created_at.localeCompare(a.created_at)).slice(0,Math.min(10,Math.max(1,limit)));
}
function extractExplicit(message){
 if(typeof message!=="string")return null;
 const match=message.trim().match(/^(?:запомни(?:\s+что)?|remember)\s*[:：]?\s+([\s\S]{1,4000})$/iu);
 return match?match[1].trim():null;
}
function count(){return db.prepare("SELECT COUNT(*) AS total FROM memories").get().total;}
function stats(model=""){const count=db.prepare("SELECT COUNT(*) AS n FROM memories").get().n;const indexed=model?db.prepare("SELECT COUNT(*) AS n FROM memory_vectors WHERE model=?").get(model).n:0;const audits=db.prepare("SELECT COUNT(*) AS n FROM tool_audit").get().n;return {count,indexed,audits,model};}
function importFacts(items){if(!Array.isArray(items)||items.length>1000)throw Error("Некорректное количество записей");const facts=items.map(x=>normalize(x));db.exec("BEGIN");try{for(const fact of facts)remember(fact);db.exec("COMMIT");}catch(e){db.exec("ROLLBACK");throw e;}return facts.length;}
function list(){return listStmt.all(100);}
function forget(id){if(typeof id!=="string"||!/^[a-f0-9]{64}$/.test(id))throw Error("Некорректный идентификатор");const deleted=deleteStmt.run(id).changes>0;if(deleted)db.prepare("DELETE FROM memory_vectors WHERE id=?").run(id);return deleted;}
function execute(name,input,approved){if(!approved)throw Error("Требуется подтверждение пользователя");if(!["calculator","memory_search","clock"].includes(name))throw Error("Инструмент не разрешён");
let output;
if(name==="clock")output=new Date().toISOString();
if(name==="memory_search")output=JSON.stringify(search(String(input||"")));
if(name==="calculator"){const expr=String(input||"").trim();if(expr.length>120||!/^[0-9+*/().% -]+$/.test(expr))throw Error("Разрешены только арифметические выражения");const tokens=expr.match(/\d+(?:\.\d+)?|[()+*/%-]/g)||[];if(tokens.join("")!==expr.replace(/\s/g,""))throw Error("Неверное выражение");
let i=0;function factor(){const t=tokens[i++];if(t==="-")return -factor();if(t==="+")return factor();if(t==="("){const v=sum();if(tokens[i++]!==")")throw Error("Не закрыта скобка");return v;}const v=Number(t);if(!Number.isFinite(v))throw Error("Некорректное число");return v;}
function term(){let v=factor();while(["*","/","%"].includes(tokens[i])){const op=tokens[i++],rhs=factor();v=op==="*"?v*rhs:op==="/"?v/rhs:v%rhs;}return v;}
function sum(){let v=term();while(["+","-"].includes(tokens[i])){const op=tokens[i++];v=op==="+"?v+term():v-term();}return v;}
const value=sum();if(i!==tokens.length||!Number.isFinite(value))throw Error("Некорректное вычисление");output=String(value);}
auditStmt.run(name,String(input).slice(0,500),String(output).slice(0,4000));return {name,output};}
module.exports={remember,search,relevant,extractExplicit,count,list,forget,execute,putVector,missingVectors,semantic,stats,importFacts,logs:()=>logsStmt.all()};
