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

test("semantic memory ranks matching embeddings",()=>{
 const fact=memory.remember("Уникальный смысловой факт "+Date.now());
 try{memory.putVector(fact.id,"test-model",[1,0,0]);const rows=memory.semantic("test-model",[1,0,0],5);assert.ok(rows.some(row=>row.id===fact.id&&row.score>0.99));}
 finally{memory.forget(fact.id);}
});
test("rejects invalid embeddings",()=>{assert.throws(()=>memory.putVector("a".repeat(64),"test-model",[1,NaN]),/вектор/);});

test("memory statistics and safe backup import",()=>{
 const fact="Резервная копия Ayureika "+Date.now();
 const before=memory.stats().count;
 assert.equal(memory.importFacts([fact,fact]),2);
 const found=memory.search(fact);
 assert.equal(found.length,1);
 assert.equal(memory.stats().count,before+1);
 assert.ok(memory.forget(found[0].id));
 assert.equal(memory.stats().count,before);
 assert.throws(()=>memory.importFacts(["", "valid"]),/Текст/);
});

test("memory revisions preserve versions and invalidate old vectors",()=>{
 const entry=memory.remember("Версия тестового договора "+Date.now());
 try{
  memory.putVector(entry.id,"revision-test",[1,0]);
  const updated=memory.revise(entry.id,"Новая редакция тестового договора");
  assert.equal(updated.id,entry.id);
  assert.equal(memory.versions(entry.id).at(0).action,"edited");
  assert.equal(memory.versions(entry.id).at(1).action,"before_edit");
  assert.ok(memory.missingVectors("revision-test",100).some(x=>x.id===entry.id));
 }finally{memory.forget(entry.id);}
});
test("similarity review does not delete or merge facts automatically",()=>{
 const stamp=String(Date.now());
 const a=memory.remember("Служебный договор поставки проверка "+stamp+" действует до декабря");
 const b=memory.remember("Служебный договор поставки проверка "+stamp+" действует до ноября");
 try{
  assert.ok(memory.reviews(100).some(x=>x.first_content.includes(stamp)&&x.second_content.includes(stamp)));
  assert.ok(memory.search(stamp).length>=2);
 }finally{memory.forget(a.id);memory.forget(b.id);}
});
