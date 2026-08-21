#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { overlaps } from "./path-overlap.mjs";

const argv = process.argv.slice(2);
const command = argv.shift() ?? "help";
const root = findRepoRoot(process.cwd());
const corpus = path.join(root, ".xenios");

function findRepoRoot(start) {
  let current = path.resolve(start);
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(current, ".git")) || fs.existsSync(path.join(current, ".xenios"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Could not locate a Xenios repository root");
}
function parseArgs(values) {
  const out = {};
  for (let i = 0; i < values.length; i += 1) {
    const key = values[i];
    if (!key.startsWith("--")) continue;
    const value = values[i + 1] && !values[i + 1].startsWith("--") ? values[++i] : "true";
    out[key.slice(2)] = value;
  }
  return out;
}
function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(corpus, rel), "utf8")); }
function writeJson(rel, value) {
  const target = path.join(corpus, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + "\n", "utf8");
}
function now() { return new Date().toISOString(); }
function clean(value) { return String(value ?? "").trim(); }
function safeId(value) {
  const id = clean(value);
  if (!/^[a-zA-Z0-9._-]{2,100}$/.test(id)) throw new Error(`Invalid id: ${id}`);
  return id;
}
function getTask(id) {
  const board = readJson("ACTIVE_TASKS.json");
  const task = board.tasks.find((entry) => entry.id === id);
  if (!task) throw new Error(`Unknown task ${id}`);
  return { board, task };
}
// Lease conflict detection lives in ./path-overlap.mjs. It used to be inlined
// here, where it cut a pattern at the first `**` and so reported a conflict
// against every lease beneath that directory — which made REQUEST-CENTER
// unclaimable by anyone and hid P1 work from nine sessions. That module
// explains the failure and shared/research/continuity/path-overlap.test.ts
// pins it.
function activeSessions() {
  const dir = path.join(corpus, "sessions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}
function validate() {
  const required = ["PROJECT_STATE.json","RELEASE_STATE.json","ROADMAP.json","ACTIVE_TASKS.json","SESSION_REGISTRY.json","CODE_OWNERSHIP.json"];
  const errors = [];
  for (const file of required) {
    try { readJson(file); } catch (error) { errors.push(`${file}: ${error.message}`); }
  }
  if (errors.length === 0) {
    const board = readJson("ACTIVE_TASKS.json");
    const seen = new Set();
    for (const task of board.tasks) {
      if (seen.has(task.id)) errors.push(`duplicate task id ${task.id}`);
      seen.add(task.id);
    }
    const ownership = readJson("CODE_OWNERSHIP.json");
    const leases = ownership.leases.filter((lease) => lease.state === "active");
    for (let i = 0; i < leases.length; i += 1) for (let j = i + 1; j < leases.length; j += 1) {
      if (leases[i].paths.some((a) => leases[j].paths.some((b) => overlaps(a, b)))) errors.push(`overlapping active leases: ${leases[i].session} and ${leases[j].session}`);
    }
  }
  if (errors.length) { console.error(JSON.stringify({ ok:false, errors }, null, 2)); process.exitCode = 1; return; }
  console.log(JSON.stringify({ ok:true, corpus }, null, 2));
}
function taskPriority(value) { return ({P0:0,P1:1,P2:2,P3:3}[value] ?? 99); }
function dependenciesDone(task, board) {
  return (task.dependsOn ?? []).every((id) => board.tasks.find((item) => item.id === id)?.state === "done");
}
function latestMessagesFor(sessionId) {
  const dir = path.join(corpus, "messages");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, 100)
    .map((name) => readJson(`messages/${name}`))
    .filter((item) => item.to === "all" || item.to === sessionId || item.from === sessionId)
    .slice(0, 20);
}
function status() {
  const project = readJson("PROJECT_STATE.json");
  const release = readJson("RELEASE_STATE.json");
  const board = readJson("ACTIVE_TASKS.json");
  const sessions = activeSessions();
  const counts = Object.fromEntries([...new Set(board.tasks.map((t) => t.state))].map((state) => [state, board.tasks.filter((t) => t.state === state).length]));
  console.log(JSON.stringify({ project, release, taskCounts:counts, sessions }, null, 2));
}
function nextTask(args) {
  const session = args.session ? safeId(args.session) : null;
  const board = readJson("ACTIVE_TASKS.json");
  const ownership = readJson("CODE_OWNERSHIP.json");
  const ready = board.tasks
    .filter((task) => task.state === "ready" && dependenciesDone(task, board))
    .filter((task) => !ownership.leases.some((lease) => lease.state === "active" && task.paths.some((a) => lease.paths.some((b) => overlaps(a, b)))))
    .sort((a, b) => taskPriority(a.priority) - taskPriority(b.priority) || a.id.localeCompare(b.id));
  console.log(JSON.stringify({ ok: true, session, next: ready[0] ?? null, candidates: ready }, null, 2));
}
function stale(args) {
  const minutes = Number(args.minutes ?? 30);
  if (!Number.isFinite(minutes) || minutes < 1) throw new Error("stale requires --minutes >= 1");
  const cutoff = Date.now() - minutes * 60_000;
  const sessions = activeSessions().filter((item) => Date.parse(item.heartbeatAt) < cutoff);
  const ownership = readJson("CODE_OWNERSHIP.json");
  const leases = ownership.leases.filter((item) => item.state === "active" && Date.parse(item.heartbeatAt) < cutoff);
  console.log(JSON.stringify({ ok: true, minutes, sessions, leases }, null, 2));
}
function resume(args) {
  const session = safeId(args.session);
  const sessionFile = `sessions/${session}.json`;
  const value = readJson(sessionFile);
  const board = readJson("ACTIVE_TASKS.json");
  const tasks = board.tasks.filter((task) => task.owner === session || task.handoff?.session === session);
  console.log(JSON.stringify({ ok: true, session: value, tasks, messages: latestMessagesFor(session) }, null, 2));
}
function register(args) {
  const id=safeId(args.id); const tool=clean(args.tool); const lane=clean(args.lane); const branch=clean(args.branch);
  if (!tool || !lane || !branch) throw new Error("register requires --id --tool --lane --branch");
  const session={id,tool,lane,branch,state:"active",startedAt:now(),heartbeatAt:now(),note:clean(args.note)};
  writeJson(`sessions/${id}.json`,session);
  const registry=readJson("SESSION_REGISTRY.json");
  registry.sessions=registry.sessions.filter((s)=>s.id!==id); registry.sessions.push(session); writeJson("SESSION_REGISTRY.json",registry);
  console.log(JSON.stringify(session,null,2));
}
function claim(args) {
  const session=safeId(args.session); const taskId=safeId(args.task);
  const sessionFile=path.join(corpus,"sessions",`${session}.json`); if(!fs.existsSync(sessionFile)) throw new Error(`session ${session} is not registered`);
  const {board,task}=getTask(taskId); if (!["ready","qa"].includes(task.state)) throw new Error(`task ${taskId} is ${task.state}`);
  const ownership=readJson("CODE_OWNERSHIP.json");
  const conflicts=ownership.leases.filter((l)=>l.state==="active"&&l.session!==session&&task.paths.some((a)=>l.paths.some((b)=>overlaps(a,b))));
  if(conflicts.length) throw new Error(`path conflict with ${conflicts.map((c)=>c.session).join(", ")}`);
  task.state="claimed"; task.owner=session; task.claimedAt=now(); writeJson("ACTIVE_TASKS.json",board);
  ownership.leases.push({id:crypto.randomUUID(),task:taskId,session,paths:task.paths,state:"active",claimedAt:now(),heartbeatAt:now()}); writeJson("CODE_OWNERSHIP.json",ownership);
  console.log(JSON.stringify({ok:true,task},null,2));
}
function heartbeat(args) {
  const session=safeId(args.session); const rel=`sessions/${session}.json`; const value=readJson(rel); value.heartbeatAt=now(); value.note=clean(args.note); writeJson(rel,value);
  const registry=readJson("SESSION_REGISTRY.json"); const found=registry.sessions.find((s)=>s.id===session); if(found){found.heartbeatAt=value.heartbeatAt;found.note=value.note;} writeJson("SESSION_REGISTRY.json",registry);
  const ownership=readJson("CODE_OWNERSHIP.json"); for(const lease of ownership.leases) if(lease.session===session&&lease.state==="active") lease.heartbeatAt=value.heartbeatAt; writeJson("CODE_OWNERSHIP.json",ownership);
  console.log(JSON.stringify(value,null,2));
}
function handoff(args) {
  const session=safeId(args.session); const taskId=safeId(args.task); const sha=clean(args.sha); const summary=clean(args.summary);
  if(!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("handoff requires a full 40-character --sha");
  if(!summary||!fs.existsSync(path.resolve(summary))) throw new Error("handoff requires --summary path");
  const content=fs.readFileSync(path.resolve(summary),"utf8"); const stamp=now().replace(/[:.]/g,"-"); const target=path.join(corpus,"handoffs",`${stamp}-${taskId}-${session}.md`); fs.writeFileSync(target,content,"utf8");
  const {board,task}=getTask(taskId); task.state="qa"; task.handoff={session,sha,file:path.relative(root,target).replaceAll("\\","/"),at:now()}; writeJson("ACTIVE_TASKS.json",board);
  const ownership=readJson("CODE_OWNERSHIP.json"); for(const lease of ownership.leases) if(lease.task===taskId&&lease.session===session&&lease.state==="active") lease.state="handoff"; writeJson("CODE_OWNERSHIP.json",ownership);
  console.log(JSON.stringify({ok:true,handoff:task.handoff},null,2));
}
function accept(args) {
  const taskId = safeId(args.task); const by = safeId(args.by); const sha = clean(args.sha);
  if(!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("accept requires a full 40-character --sha");
  const {board,task}=getTask(taskId);
  if(task.state!=="qa") throw new Error(`task ${taskId} is ${task.state}, expected qa`);
  if(task.handoff?.sha!==sha) throw new Error("accepted SHA does not match the handoff SHA");
  task.state="done"; task.acceptedSha=sha; task.acceptedBy=by; task.acceptedAt=now();
  writeJson("ACTIVE_TASKS.json",board);
  const ownership=readJson("CODE_OWNERSHIP.json"); for(const lease of ownership.leases) if(lease.task===taskId&&lease.state!=="released") lease.state="released"; writeJson("CODE_OWNERSHIP.json",ownership);
  console.log(JSON.stringify({ok:true,task},null,2));
}
function release(args) {
  const session=safeId(args.session); const taskId=safeId(args.task); const {board,task}=getTask(taskId); if(task.owner!==session&&task.handoff?.session!==session) throw new Error("session does not own task");
  task.state="ready"; task.owner=null; task.releasedAt=now(); writeJson("ACTIVE_TASKS.json",board);
  const ownership=readJson("CODE_OWNERSHIP.json"); for(const lease of ownership.leases) if(lease.task===taskId&&lease.session===session&&lease.state!=="released") lease.state="released"; writeJson("CODE_OWNERSHIP.json",ownership);
  console.log(JSON.stringify({ok:true,task:taskId},null,2));
}
function message(args) {
  const from=safeId(args.from); const to=clean(args.to)||"all"; const text=clean(args.text); if(!text) throw new Error("message requires --text");
  const stamp=now().replace(/[:.]/g,"-"); const id=crypto.randomUUID(); const value={id,from,to,text,createdAt:now()}; writeJson(`messages/${stamp}-${from}.json`,value); console.log(JSON.stringify(value,null,2));
}
function help(){console.log(`xenios-os commands: validate, status, next, stale, resume, register, claim, heartbeat, handoff, accept, release, message`);}

try {
  const args=parseArgs(argv);
  ({validate,status,next:()=>nextTask(args),stale:()=>stale(args),resume:()=>resume(args),register:()=>register(args),claim:()=>claim(args),heartbeat:()=>heartbeat(args),handoff:()=>handoff(args),accept:()=>accept(args),release:()=>release(args),message:()=>message(args),help}[command]??help)();
} catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
