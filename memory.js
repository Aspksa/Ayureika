"use strict";
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {DatabaseSync}=require("node:sqlite");
const dataDir=path.join(__dirname,"data");
fs.mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(path.join(dataDir,"memory.sqlite"));
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, content TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS tool_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, input TEXT NOT NULL, output TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
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
function list(){return listStmt.all(100);}
function forget(id){if(typeof id!=="string"||!/^[a-f0-9]{64}$/.test(id))throw Error("Некорректный идентификатор");return deleteStmt.run(id).changes>0;}
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
module.exports={remember,search,relevant,extractExplicit,count,list,forget,execute,logs:()=>logsStmt.all()};
