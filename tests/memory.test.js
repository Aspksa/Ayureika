"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const memory=require("../memory");
test("deduplicates remembered facts",()=>{
 const value="Проверка Ayureika "+Date.now();
 const a=memory.remember(value),b=memory.remember(value);
 assert.equal(a.id,b.id);
 assert.equal(memory.search(value).filter(x=>x.id===a.id).length,1);
 assert.equal(memory.forget(a.id),true);
});
test("retrieves relevant facts by individual words",()=>{
 const fact=memory.remember("Мой уникальный проект Айюрейка хранит сведения о контрактах");
 try{assert.ok(memory.relevant("Расскажи про контрактах").some(x=>x.id===fact.id));}
 finally{memory.forget(fact.id);}
});
test("only explicit instructions trigger remembering",()=>{
 assert.equal(memory.extractExplicit("Запомни: люблю чёрно-золотой дизайн"),"люблю чёрно-золотой дизайн");
 assert.equal(memory.extractExplicit("Что ты помнишь?"),null);
});
test("tool execution requires confirmation",()=>{
 assert.throws(()=>memory.execute("calculator","2+2",false),/подтверждение/);
 assert.equal(memory.execute("calculator","2+2",true).output,"4");
 assert.throws(()=>memory.execute("shell","dir",true),/не разрешён/);
});
