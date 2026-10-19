import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDineExpiryDiagnostics,
  createDineExpiryLogSink,
  dineExpiryMutexName,
  isTrustedDineExpiryAclSnapshot,
  runWithDineExpiryMutex,
} from "../modules/events/dine-expiry-log.js";
import {
  REQUIRED_DINE_EXPIRY_MIGRATIONS,
  createDineBookingExpiryScheduler,
  startDineBookingExpiryIfMigrated,
} from "../modules/events/dine-booking-expiry.scheduler.js";

const temporaryDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), "tastebridge-dine-log-"));
const removeTemporaryDirectory = (directory) => fs.rmSync(directory, { recursive: true, force: true });
const silentLog = { info() {}, warn() {}, error() {} };
const fixedNow = () => new Date("2026-10-18T12:34:56.789Z");
const localLock = async (_directory, operation) => ({ acquired: true, value: await operation() });
const makeSink = (options = {}) => createDineExpiryLogSink({ withLock: localLock, ...options });

test("JSONL persistence contains only fixed event data and validated allowlisted fields", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const sink = makeSink({
    directory: path.join(root, "logs"), verifyAcl: () => true, now: fixedNow,
  });

  assert.equal(await sink.record("expiry-failed", {
    prismaCode: "P2010", postgresSqlState: "42703", category: "undefined_column", stage: "due-booking-lock",
    bookingId: "booking-secret", customerEmail: "private@example.test", sql: "SELECT secret", rawError: "sensitive",
    invalidCode: "anything", invalidCategory: "raw database details", invalidStage: "somewhere",
  }), true);

  const rows = fs.readFileSync(sink.path, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(rows, [{
    timestamp: "2026-10-18T12:34:56.789Z", event: "expiry-failed", prismaCode: "P2010",
    postgresSqlState: "42703", category: "undefined_column", stage: "due-booking-lock",
  }]);
});

test("unverified existing log contents disable append without exposing the stored text", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "dine-expiry.jsonl"), '{"timestamp":"2026-10-18T12:00:00.000Z","event":"expiry-failed","rawError":"private old detail"}\n');
  const warnings = [];
  const sink = makeSink({ directory, verifyAcl: () => true, onPersistenceDisabled: (reason) => warnings.push(reason) });

  assert.equal(await sink.record("enabled"), false);
  assert.deepEqual(warnings, ["persistence_existing_log_unverified"]);
  assert.match(fs.readFileSync(sink.path, "utf8"), /private old detail/);
  assert.equal(sink.status.enabled, false);
});

test("migration gate records enabled, disabled, and sanitized check-failed outcomes", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const sink = makeSink({ directory: path.join(root, "logs"), verifyAcl: () => true, now: fixedNow });
  const diagnostics = createDineExpiryDiagnostics({ log: silentLog, sink });
  let timerCallback;
  const start = (rows) => startDineBookingExpiryIfMigrated({
    $queryRaw: async () => typeof rows === "function" ? rows() : rows,
  }, {
    diagnostics,
    log: silentLog,
    service: { runBatch: async () => ({ expiredCount: 0, releasedSeats: 0 }) },
    setIntervalFn: (callback) => { timerCallback = callback; return { unref() {} }; },
    clearIntervalFn() {},
  });

  const enabled = await start(REQUIRED_DINE_EXPIRY_MIGRATIONS.map((migration_name) => ({ migration_name })));
  assert.ok(enabled);
  await enabled.stop();
  assert.equal(await start([]), null);
  const failed = Object.assign(new Error("never persist or print this"), {
    code: "P2010", meta: { driverAdapterError: { cause: { originalCode: "42703", originalMessage: "private SQL detail" } } },
  });
  assert.equal(await start(() => { throw failed; }), null);
  await new Promise((resolve) => setImmediate(resolve));
  const events = fs.readFileSync(sink.path, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map(({ event }) => event), ["enabled", "disabled", "check-failed"]);
  assert.equal(events[2].category, "undefined_column");
  assert.equal(events[2].prismaCode, "P2010");
  assert.equal(events[2].postgresSqlState, "42703");
  assert.doesNotMatch(JSON.stringify(events), /never persist|private SQL|ignored-in-persisted-output/);
  assert.equal(typeof timerCallback, "function");
});

test("bounded rotation retains only the active file and configured archive count", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  const sink = makeSink({ directory, verifyAcl: () => true, now: fixedNow, maxFileBytes: 150, maxArchives: 2 });
  for (let index = 0; index < 8; index += 1) await sink.record("disabled");

  const files = fs.readdirSync(directory).sort();
  assert.deepEqual(files, ["dine-expiry.jsonl", "dine-expiry.jsonl.1", "dine-expiry.jsonl.2"]);
  assert.ok(fs.statSync(sink.path).size <= 150);
  assert.ok(files.every((file) => fs.statSync(path.join(directory, file)).size <= 150));
});

test("pre-existing numbered archives beyond the limit are validated then pruned", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  fs.mkdirSync(directory);
  const row = `${JSON.stringify({ timestamp: "2026-10-18T12:00:00.000Z", event: "disabled" })}\n`;
  for (const suffix of [1, 2, 3, 4, 8]) fs.writeFileSync(path.join(directory, `dine-expiry.jsonl.${suffix}`), row);
  const sink = makeSink({ directory, maxArchives: 3, verifyAcl: () => true, now: fixedNow });

  assert.equal(await sink.record("enabled"), true);
  assert.deepEqual(fs.readdirSync(directory).sort(), [
    "dine-expiry.jsonl", "dine-expiry.jsonl.1", "dine-expiry.jsonl.2", "dine-expiry.jsonl.3",
  ]);
});

test("malformed archive names and contents fail closed without touching unrelated files", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, "dine-expiry.jsonl.4"), "not-json\n");
  fs.writeFileSync(path.join(directory, "dine-expiry.jsonl.backup"), "leave this alone");
  const sink = makeSink({ directory, verifyAcl: () => true });

  assert.equal(await sink.record("enabled"), false);
  assert.equal(fs.existsSync(path.join(directory, "dine-expiry.jsonl.4")), true);
  assert.equal(fs.readFileSync(path.join(directory, "dine-expiry.jsonl.backup"), "utf8"), "leave this alone");
  assert.equal(sink.status.disabledReason, "persistence_archive_state_unverified");
});

test("a later rotation-step failure disables persistence safely and does not escape", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  fs.mkdirSync(directory);
  const existingRow = `${JSON.stringify({ timestamp: "2026-10-18T12:00:00.000Z", event: "disabled" })}\n`;
  fs.writeFileSync(path.join(directory, "dine-expiry.jsonl"), existingRow.repeat(2));
  fs.writeFileSync(path.join(directory, "dine-expiry.jsonl.1"), existingRow);
  let renameCalls = 0;
  const baseFs = fs;
  const failingFs = new Proxy(baseFs, {
    get(target, property) {
      if (property === "renameSync") return (...args) => {
        renameCalls += 1;
        if (renameCalls === 2) throw new Error("private rename failure");
        return target.renameSync(...args);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const sink = makeSink({ directory, fsModule: failingFs, verifyAcl: () => true, maxFileBytes: 130 });
  assert.equal(await sink.record("disabled"), false);
  assert.equal(renameCalls, 2);
  assert.ok(fs.existsSync(path.join(directory, "dine-expiry.jsonl.2")));
  assert.ok(fs.existsSync(path.join(directory, "dine-expiry.jsonl")));
  assert.equal(sink.status.disabledReason, "persistence_filesystem_error");
});

test("ACL verification failure disables persistence and reports a static reason once", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const warnings = [];
  const sink = makeSink({
    directory: path.join(root, "logs"), verifyAcl: () => false, now: fixedNow,
    onPersistenceDisabled: (reason) => warnings.push(reason),
  });
  assert.equal(await sink.record("enabled"), false);
  assert.equal(await sink.record("disabled"), false);
  assert.deepEqual(warnings, ["persistence_acl_unverified"]);
  assert.deepEqual(sink.status, { enabled: false, disabledReason: "persistence_acl_unverified" });

  const toolFailure = makeSink({ directory: path.join(root, "acl-tool-failure"), verifyAcl: () => { throw new Error("do not expose ACL tool output"); } });
  assert.equal(await toolFailure.record("enabled"), false);
  assert.equal(toolFailure.status.disabledReason, "persistence_acl_unverified");
});

test("trusted ACL verification rejects unexpected owners and malformed or permissive ACL snapshots", () => {
  const currentSid = "S-1-5-21-100-200-300-1001";
  const good = [{
    ownerSid: currentSid,
    rules: [
      { sid: currentSid, allow: true, rights: 2032127 },
      { sid: "S-1-5-18", allow: true, rights: 2032127 },
      { sid: "S-1-5-32-544", allow: true, rights: 2032127 },
    ],
  }];
  assert.equal(isTrustedDineExpiryAclSnapshot(good, currentSid), true);
  assert.equal(isTrustedDineExpiryAclSnapshot([{ ...good[0], ownerSid: "S-1-5-21-9" }], currentSid), false);
  assert.equal(isTrustedDineExpiryAclSnapshot([{ ...good[0], rules: [...good[0].rules, { sid: "S-1-1-0", allow: true, rights: 2032127 }] }], currentSid), false);
  assert.equal(isTrustedDineExpiryAclSnapshot([{ ...good[0], rules: [{ sid: currentSid, allow: true, rights: 1 }] }], currentSid), false);
  assert.equal(isTrustedDineExpiryAclSnapshot(null, currentSid), false);
});

test("lock timeout falls back without permanently disabling later persistence", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const warnings = [];
  const events = [];
  let locked = false;
  const sink = makeSink({
    directory: path.join(root, "logs"), verifyAcl: () => true,
    withLock: async (_directory, operation) => locked
      ? { acquired: true, value: await operation() }
      : { acquired: false },
    onPersistenceDisabled: (reason) => warnings.push(reason),
  });
  const diagnostics = createDineExpiryDiagnostics({
    sink,
    log: { warn: (...args) => events.push(args), error: (...args) => events.push(args) },
  });
  assert.equal(await diagnostics.record("expiry-failed", { prismaCode: "P2010", stage: "seat-release" }), false);
  assert.equal(sink.status.disabledReason, null);
  assert.deepEqual(events, [["Dine expiry diagnostic: expiry-failed.", { prismaCode: "P2010", stage: "seat-release" }]]);
  assert.deepEqual(warnings, []);
  locked = true;
  assert.equal(await diagnostics.record("disabled"), true);
});

test("Windows ACL verification accepts the current trusted owner for the directory, active log, and archives", {
  skip: process.platform !== "win32" && "Windows ACL integration is Windows-only",
}, async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  const sink = createDineExpiryLogSink({ directory, maxFileBytes: 100 });
  assert.equal(await sink.record("disabled"), true);
  assert.equal(await sink.record("enabled"), true);
  assert.equal(sink.status.enabled, true);
  assert.ok(fs.existsSync(`${sink.path}.1`));
});

test("separate Windows processes can concurrently append and rotate without corrupting JSONL", {
  skip: process.platform !== "win32" && "Windows named-mutex integration is Windows-only",
}, async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  const moduleUrl = new URL("../modules/events/dine-expiry-log.js", import.meta.url).href;
  const writer = `
    import { createDineExpiryLogSink } from ${JSON.stringify(moduleUrl)};
    const sink = createDineExpiryLogSink({ directory: process.argv[1], verifyAcl: () => true, maxFileBytes: 260, maxArchives: 3 });
    for (let i = 0; i < 35; i += 1) {
      if (!(await sink.record("disabled", { stage: "due-booking-lock" }))) process.exitCode = 2;
    }
  `;
  const runWriter = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", writer, directory], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`writer exit ${code}: ${stderr}`)));
  });
  await Promise.all([runWriter(), runWriter()]);

  const names = fs.readdirSync(directory).sort();
  assert.ok(names.length <= 4);
  assert.ok(names.includes("dine-expiry.jsonl"));
  assert.deepEqual(names.filter((name) => name !== "dine-expiry.jsonl").every((name) => /^dine-expiry\.jsonl\.[1-3]$/.test(name)), true);
  let retainedRows = 0;
  for (const name of names) {
    const contents = fs.readFileSync(path.join(directory, name), "utf8");
    assert.ok(Buffer.byteLength(contents) <= 260);
    const rows = contents.trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    assert.ok(rows.every((row) => row.event === "disabled" && row.stage === "due-booking-lock"));
    retainedRows += rows.length;
  }
  assert.ok(retainedRows > 0);
});

test("a process crash abandons the Windows mutex and the next writer recovers it", {
  skip: process.platform !== "win32" && "Windows named-mutex integration is Windows-only",
}, (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const mutexName = dineExpiryMutexName(root).replaceAll("'", "''");
  const script = `$m=[System.Threading.Mutex]::new($false,'${mutexName}'); [void]$m.WaitOne(); [Environment]::Exit(0)`;
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
  });
  return runWithDineExpiryMutex(root, () => 42).then((result) => {
    assert.deepEqual(result, { acquired: true, value: 42 });
  });
});

test("a live Windows mutex owner is not stolen and lock waiting is bounded", {
  skip: process.platform !== "win32" && "Windows named-mutex integration is Windows-only",
}, async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const mutexName = dineExpiryMutexName(root).replaceAll("'", "''");
  const script = `$m=[System.Threading.Mutex]::new($false,'${mutexName}'); [void]$m.WaitOne(); [Console]::Out.WriteLine('HELD'); [Console]::Out.Flush(); Start-Sleep -Milliseconds 1500; $m.ReleaseMutex(); $m.Dispose()`;
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const holder = spawn(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
  });
  t.after(() => { try { holder.kill(); } catch { /* Test cleanup only. */ } });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("mutex holder did not become ready")), 5000);
    holder.stdout.setEncoding("utf8");
    holder.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("HELD")) { clearTimeout(timer); resolve(); }
    });
    holder.on("error", (error) => { clearTimeout(timer); reject(error); });
  });

  let callbackRan = false;
  assert.equal(await runWithDineExpiryMutex(root, () => { callbackRan = true; }, { waitMs: 100 }), false);
  assert.equal(callbackRan, false);
  await new Promise((resolve, reject) => {
    holder.on("error", reject);
    holder.on("close", (code) => code === 0 ? resolve() : reject(new Error(`mutex holder exit ${code}`)));
  });
  assert.deepEqual(await runWithDineExpiryMutex(root, () => 7), { acquired: true, value: 7 });
});

test("filesystem logging failures are contained and empty sweeps remain silent", async (t) => {
  const root = temporaryDirectory();
  t.after(() => removeTemporaryDirectory(root));
  const directory = path.join(root, "logs");
  const failingFs = new Proxy(fs, {
    get(target, property) {
      if (property === "mkdirSync") return () => { throw new Error("private filesystem failure"); };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const disabled = [];
  const sink = makeSink({ directory, fsModule: failingFs, verifyAcl: () => true, onPersistenceDisabled: (reason) => disabled.push(reason) });
  assert.equal(await sink.record("enabled"), false);
  assert.deepEqual(disabled, ["persistence_filesystem_error"]);

  const messages = [];
  const diagnostics = createDineExpiryDiagnostics({
    log: { info: (...args) => messages.push(args), warn: (...args) => messages.push(args), error: (...args) => messages.push(args) },
    sink: makeSink({ directory: path.join(root, "empty-sweep"), verifyAcl: () => true }),
  });
  const scheduler = createDineBookingExpiryScheduler({
    service: { runBatch: async () => ({ expiredCount: 0, releasedSeats: 0 }) }, diagnostics, log: silentLog,
  });
  assert.deepEqual(await scheduler.runTick(), { expiredCount: 0, releasedSeats: 0 });
  assert.deepEqual(messages, []);
  assert.equal(fs.existsSync(path.join(root, "empty-sweep")), false);
});

test("append and console logging failures never escape into scheduler startup or expiry", async () => {
  const throwingLog = { info() { throw new Error("console unavailable"); }, warn() { throw new Error("console unavailable"); }, error() { throw new Error("console unavailable"); } };
  const throwingFs = new Proxy(fs, {
    get(target, property) {
      if (property === "appendFileSync") return () => { throw new Error("disk unavailable"); };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const root = temporaryDirectory();
  try {
    const sink = makeSink({
      directory: path.join(root, "logs"), fsModule: throwingFs, verifyAcl: () => true,
    });
    const diagnostics = createDineExpiryDiagnostics({ log: throwingLog, sink });
    assert.doesNotThrow(() => diagnostics.record("enabled"));
    assert.deepEqual(await startDineBookingExpiryIfMigrated({ $queryRaw: async () => [] }, { log: throwingLog, diagnostics }), null);

    const scheduler = createDineBookingExpiryScheduler({
      service: { runBatch: async () => { throw new Error("private failure"); } },
      log: throwingLog, diagnostics,
    });
    assert.deepEqual(await scheduler.runTick(), { expiredCount: 0, releasedSeats: 0, failed: true });
  } finally {
    removeTemporaryDirectory(root);
  }
});
