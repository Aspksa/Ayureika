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

test("index queue and review counters reflect SQLite records",()=>{
 const row=memory.remember("Проверка очереди векторов "+Date.now());
 try{
  assert.ok(memory.pendingVectors("new-model-check-2026")>=1);
  assert.ok(memory.stats("new-model-check-2026").pendingVectors>=1);
  memory.putVector(row.id,"new-model-check-2026",[0.5,0.5]);
  assert.ok(!memory.missingVectors("new-model-check-2026",100).some(x=>x.id===row.id));
  assert.ok(Number.isInteger(memory.stats().pendingReviews));
 }finally{memory.forget(row.id);}
});

test("hybrid retrieval combines lexical and vector matches",()=>{
 const fact=memory.remember("Уникальная спецификация оборудования "+Date.now());
 try{memory.putVector(fact.id,"hybrid-test",[1,0,0]);assert.ok(memory.hybrid("спецификация",[1,0,0],"hybrid-test",10).some(x=>x.id===fact.id));}
 finally{memory.forget(fact.id);}
});
test("automatic suggestions require explicit approval",()=>{
 const phrase="Мой проект тестовых данных "+Date.now();
 memory.propose(phrase,"unit-test");
 const row=memory.candidates(100).find(x=>x.content===phrase);
 assert.ok(row);assert.equal(memory.search(phrase).length,0);
 assert.equal(memory.decideCandidate(row.id,true).approved,true);
 const found=memory.search(phrase);assert.equal(found.length,1);memory.forget(found[0].id);
});
test("links, sources and versions survive full backup restore",()=>{
 const stamp=Date.now();
 const a=memory.remember("Документ поставки "+stamp),b=memory.remember("Решение согласовать "+stamp);
 try{
  memory.link(a.id,b.id,"decision");memory.annotate(a.id,"Проверка пользователя","user_confirmed");
  const copy=memory.fullBackup();assert.equal(copy.version,2);
  assert.ok(copy.tables.memory_links.some(x=>x.from_id===a.id&&x.to_id===b.id));
  assert.ok(copy.tables.memory_versions.some(x=>x.memory_id===a.id));
  assert.equal(copy.tables.memory_sources.find(x=>x.memory_id===a.id).confidence,"user_confirmed");
  memory.forget(a.id);memory.forget(b.id);
  const result=memory.restoreFull(copy);assert.ok(result.imported>=2);
  assert.equal(memory.links(a.id).length,1);
  assert.equal(memory.sourceInfo(a.id).confidence,"user_confirmed");
  assert.ok(memory.search(String(stamp)).length>=2);
 }finally{memory.forget(a.id);memory.forget(b.id);}
});
test("maintenance creates a report without changing facts",()=>{
 const before=memory.stats().count;
 const report=memory.maintenance();
 assert.equal(report.memories,before);assert.equal(memory.stats().count,before);
 assert.ok(memory.journal().some(x=>x.action==="maintenance"));
});
test("malformed full backup fails before modifying database",()=>{
 const before=memory.stats().count;
 assert.throws(()=>memory.restoreFull({kind:"ayureika-sqlite-backup",version:2,tables:{memories:[]}}),/таблица/);
 assert.equal(memory.stats().count,before);
});
