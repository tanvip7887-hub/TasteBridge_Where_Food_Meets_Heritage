import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_ARCHIVES = 3;
const EVENTS = new Set(["enabled", "disabled", "check-failed", "expiry-failed"]);
const PRISMA_CODE = /^P\d{4}$/;
const SQLSTATE = /^[A-Z0-9]{5}$/;
const CATEGORIES = new Set([
  "sql_syntax_error", "undefined_column", "undefined_database_object", "undefined_table",
  "undefined_function", "insufficient_privilege", "invalid_datetime_format", "invalid_value_format",
  "not_null_constraint_violation", "foreign_key_constraint_violation", "unique_constraint_violation",
  "check_constraint_violation", "serialization_failure", "deadlock_detected",
  "transaction_already_failed", "connection_exception", "connection_does_not_exist",
  "connection_failure", "unclassified_database_error",
  "persistence_acl_unverified", "persistence_path_unsafe", "persistence_directory_unavailable",
  "persistence_filesystem_error", "persistence_unsupported_platform", "persistence_existing_log_unverified",
  "persistence_archive_state_unverified",
]);
const STAGES = new Set(["due-booking-lock", "seat-release"]);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const LOG_NAME = "dine-expiry.jsonl";
const MUTEX_WAIT_MS = 750;
const MUTEX_PROCESS_TIMEOUT_MS = 5000;

const isWithin = (parent, candidate) => {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

const safeFields = (fields = {}) => {
  const result = {};
  const read = (key) => { try { return fields?.[key]; } catch { return undefined; } };
  const prismaCode = read("prismaCode");
  const postgresSqlState = read("postgresSqlState");
  const category = read("category");
  const stage = read("stage");
  if (typeof prismaCode === "string" && PRISMA_CODE.test(prismaCode)) result.prismaCode = prismaCode;
  if (typeof postgresSqlState === "string" && SQLSTATE.test(postgresSqlState)) result.postgresSqlState = postgresSqlState;
  if (typeof category === "string" && CATEGORIES.has(category)) result.category = category;
  if (typeof stage === "string" && STAGES.has(stage)) result.stage = stage;
  return result;
};

const isSafeExistingLog = (fsModule, file, maxBytes) => {
  if (fsModule.statSync(file).size > maxBytes) return false;
  const contents = fsModule.readFileSync(file, "utf8");
  if (!contents) return true;
  const lines = contents.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const allowedKeys = new Set(["timestamp", "event", "prismaCode", "postgresSqlState", "category", "stage"]);
  return lines.every((line) => {
    if (!line) return false;
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row)
        || Object.keys(row).some((key) => !allowedKeys.has(key))
        || typeof row.timestamp !== "string" || !Number.isFinite(Date.parse(row.timestamp))
        || new Date(row.timestamp).toISOString() !== row.timestamp || !EVENTS.has(row.event)) return false;
      const validated = safeFields(row);
      return ["prismaCode", "postgresSqlState", "category", "stage"].every((key) =>
        !(key in row) || row[key] === validated[key]);
    } catch { return false; }
  });
};

const mutexScript = (mutexName, waitMs) => `
$ErrorActionPreference = 'Stop'
$mutex = [System.Threading.Mutex]::new($false, '${mutexName}')
$owned = $false
try {
  try { $owned = $mutex.WaitOne(${waitMs}) }
  catch [System.Threading.AbandonedMutexException] { $owned = $true }
  if (-not $owned) { [Console]::Out.WriteLine('LOCK_TIMEOUT'); [Console]::Out.Flush() }
  else {
    [Console]::Out.WriteLine('LOCKED')
    [Console]::Out.Flush()
    [void][Console]::In.ReadLine()
  }
}
finally {
  if ($owned) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
`;

export const dineExpiryMutexName = (directory) => {
  const hash = createHash("sha256").update(path.resolve(directory).toLowerCase()).digest("hex").slice(0, 32);
  return `Global\\TasteBridge_DineExpiry_${hash}`;
};

export const runWithDineExpiryMutex = (directory, operation, { spawnFn = spawn, waitMs = MUTEX_WAIT_MS } = {}) => {
  if (process.platform !== "win32") return Promise.resolve(false);
  const name = dineExpiryMutexName(directory);
  const encoded = Buffer.from(mutexScript(name, waitMs), "utf16le").toString("base64");
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

  return new Promise((resolve) => {
    let child;
    let buffer = "";
    let acquired = false;
    let completed = false;
    let operationResult = false;
    let operationError;
    let timer;
    const finish = (result) => {
      if (completed) return;
      completed = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    try {
      child = spawnFn(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
        stdio: ["pipe", "pipe", "ignore"], windowsHide: true,
      });
    } catch {
      finish(false);
      return;
    }
    timer = setTimeout(() => {
      try { child.kill(); } catch { /* Process exit releases a held mutex. */ }
      finish(false);
    }, MUTEX_PROCESS_TIMEOUT_MS);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (line.trim() === "LOCK_TIMEOUT") { finish(false); return; }
        if (line.trim() !== "LOCKED" || acquired || completed) continue;
        acquired = true;
        try { operationResult = operation(); }
        catch (error) { operationError = error; }
        try { child.stdin?.end("RELEASE\n"); } catch { /* EOF also releases the mutex. */ }
      }
    });
    child.on("error", () => finish(false));
    child.on("close", () => {
      if (operationError) finish({ acquired: true, value: false });
      else finish(acquired ? { acquired: true, value: operationResult } : { acquired: false });
    });
  });
};

const aclScript = (pathsToCheck) => {
  const encodedPaths = Buffer.from(JSON.stringify(pathsToCheck), "utf8").toString("base64");
  return `
$ErrorActionPreference = 'Stop'
$paths = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPaths}')) | ConvertFrom-Json
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($identity, 'S-1-5-18', 'S-1-5-32-544')
$snapshots = @()
foreach ($item in $paths) {
  if ([System.IO.Directory]::Exists($item)) { $acl = [System.IO.Directory]::GetAccessControl($item) }
  elseif ([System.IO.File]::Exists($item)) { $acl = [System.IO.File]::GetAccessControl($item) }
  else { throw 'ACL target missing' }
  $owner = $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  if ($allowed -notcontains $owner) { throw 'ACL owner untrusted' }
  $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
  if ($rules.Count -eq 0) { throw 'ACL missing' }
  $hasUserWrite = $false
  $ruleSnapshots = @()
  foreach ($rule in $rules) {
    $ruleSid = $rule.IdentityReference.Value
    if ($allowed -notcontains $ruleSid -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow) { throw 'ACL unsafe' }
    if ($ruleSid -eq $identity -and (($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Modify) -ne 0)) { $hasUserWrite = $true }
    $ruleSnapshots += [PSCustomObject]@{ sid = $ruleSid; allow = ($rule.AccessControlType -eq [Security.AccessControl.AccessControlType]::Allow); rights = [int]$rule.FileSystemRights }
  }
  if (-not $hasUserWrite) { throw 'User write ACL missing' }
  $snapshots += [PSCustomObject]@{ ownerSid = $owner; rules = $ruleSnapshots }
}
[Console]::Write((ConvertTo-Json -InputObject ([PSCustomObject]@{ currentSid = $identity; items = $snapshots }) -Compress -Depth 5))
`;
};

const MODIFY_RIGHTS_MASK = 197055;

export const isTrustedDineExpiryAclSnapshot = (snapshots, currentSid) => {
  if (!Array.isArray(snapshots) || snapshots.length === 0 || typeof currentSid !== "string") return false;
  const trusted = new Set([currentSid, "S-1-5-18", "S-1-5-32-544"]);
  return snapshots.every((snapshot) => {
    if (!snapshot || !trusted.has(snapshot.ownerSid) || !Array.isArray(snapshot.rules) || snapshot.rules.length === 0) return false;
    let currentUserCanModify = false;
    for (const rule of snapshot.rules) {
      if (!rule || !trusted.has(rule.sid) || rule.allow !== true || !Number.isInteger(rule.rights)) return false;
      if (rule.sid === currentSid && (rule.rights & MODIFY_RIGHTS_MASK) === MODIFY_RIGHTS_MASK) currentUserCanModify = true;
    }
    return currentUserCanModify;
  });
};

const verifyWindowsAcl = (paths, { execFileSyncFn = execFileSync, currentSid = null } = {}) => {
  if (process.platform !== "win32") return false;
  const script = aclScript(paths);
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const powershell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const output = execFileSyncFn(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], {
    encoding: "utf8", windowsHide: true, timeout: 5000, maxBuffer: 16 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
  const snapshot = JSON.parse(output);
  return isTrustedDineExpiryAclSnapshot(snapshot?.items, currentSid || snapshot?.currentSid);
};

const numberedArchives = (fsModule, directory, activePath) => {
  const prefix = `${path.basename(activePath)}.`;
  const names = fsModule.readdirSync(directory);
  const archives = [];
  for (const name of names) {
    if (!name.startsWith(prefix)) continue;
    if (!/^dine-expiry\.jsonl\.[1-9]\d*$/.test(name)) {
      const error = new Error("Malformed Dine log archive name.");
      error.code = "DINE_ARCHIVE_STATE";
      throw error;
    }
    archives.push({ index: Number(name.slice(prefix.length)), file: path.join(directory, name) });
  }
  return archives.sort((left, right) => left.index - right.index);
};

const assertNoLink = (fsModule, target) => {
  const stats = fsModule.lstatSync(target);
  if (stats.isSymbolicLink()) throw new Error("Log path must not contain symbolic links.");
  if (stats.isFile() && stats.nlink > 1) throw new Error("Log file must not be hard-linked.");
  return stats;
};

const assertNoLinkedPathComponents = (fsModule, root, target) => {
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Log path must remain below its trusted parent.");
  }
  let cursor = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    if (fsModule.existsSync(cursor)) assertNoLink(fsModule, cursor);
  }
};

export const createDineExpiryLogSink = ({
  directory,
  localAppData = process.env.LOCALAPPDATA,
  fsModule = fs,
  verifyAcl = verifyWindowsAcl,
  now = () => new Date(),
  maxFileBytes = MAX_FILE_BYTES,
  maxArchives = MAX_ARCHIVES,
  withLock = (directoryPath, operation) => runWithDineExpiryMutex(directoryPath, operation),
  onPersistenceDisabled = () => {},
} = {}) => {
  const boundedFileBytes = Number.isInteger(maxFileBytes) && maxFileBytes > 0
    ? Math.min(maxFileBytes, MAX_FILE_BYTES)
    : MAX_FILE_BYTES;
  const boundedArchives = Number.isInteger(maxArchives) && maxArchives >= 0
    ? Math.min(maxArchives, MAX_ARCHIVES)
    : MAX_ARCHIVES;
  const targetDirectory = directory || (localAppData ? path.join(localAppData, "TasteBridge", "logs") : null);
  const activePath = targetDirectory ? path.join(targetDirectory, LOG_NAME) : null;
  let ready = false;
  let disabledReason = null;
  let notified = false;

  const disable = (reason) => {
    ready = false;
    disabledReason = reason;
    if (!notified) {
      notified = true;
      try { onPersistenceDisabled(reason); } catch { /* Diagnostics must never disrupt the caller. */ }
    }
  };

  const verifyAclSafely = (paths, options) => {
    try {
      if (verifyAcl(paths, options)) return true;
    } catch { /* ACL-tool errors are handled as an unverified permission state. */ }
    disable("persistence_acl_unverified");
    return false;
  };

  const expectedFiles = (resolvedDirectory) => {
    const archives = numberedArchives(fsModule, resolvedDirectory, activePath);
    return { files: [activePath, ...archives.map(({ file }) => file)].filter((file) => fsModule.existsSync(file)), archives };
  };

  const prepare = () => {
    if (disabledReason) return false;
    if (!targetDirectory || !path.isAbsolute(targetDirectory)) { disable("persistence_directory_unavailable"); return false; }
    const resolvedDirectory = path.resolve(targetDirectory);
    if (isWithin(REPO_ROOT, resolvedDirectory)) { disable("persistence_path_unsafe"); return false; }
    if (process.platform !== "win32" && !directory) { disable("persistence_unsupported_platform"); return false; }

    try {
      const localRoot = directory ? path.dirname(resolvedDirectory) : path.resolve(localAppData);
      if (!fsModule.existsSync(localRoot)) { disable("persistence_directory_unavailable"); return false; }
      assertNoLink(fsModule, localRoot);
      assertNoLinkedPathComponents(fsModule, localRoot, resolvedDirectory);

      let cursor = resolvedDirectory;
      while (!fsModule.existsSync(cursor)) {
        const parent = path.dirname(cursor);
        if (parent === cursor) throw new Error("Log directory parent is unavailable.");
        cursor = parent;
      }
      assertNoLink(fsModule, cursor);
      fsModule.mkdirSync(resolvedDirectory, { recursive: true, mode: 0o700 });
      assertNoLink(fsModule, resolvedDirectory);

      const { files: existingFiles, archives } = expectedFiles(resolvedDirectory);
      for (const file of existingFiles) {
        if (!assertNoLink(fsModule, file).isFile()) throw new Error("Unexpected log path type.");
        if (!isSafeExistingLog(fsModule, file, boundedFileBytes)) {
          disable("persistence_existing_log_unverified");
          return false;
        }
      }
      // Verify the effective inherited ACL as-is. Do not rewrite owners or add
      // principals; unsafe inheritance fails closed instead of being widened.
      if (!verifyAclSafely([resolvedDirectory, ...existingFiles])) return false;

      // Only exact, validated Dine archive names are eligible for pruning.
      // Validate ownership and contents before deleting excess numbered files.
      for (const { index, file } of archives) {
        if (index > boundedArchives) fsModule.unlinkSync(file);
      }
      const fd = fsModule.openSync(activePath, "a", 0o600);
      fsModule.closeSync(fd);
      const remainingFiles = expectedFiles(resolvedDirectory).files;
      if (!verifyAclSafely([resolvedDirectory, ...remainingFiles])) return false;
      ready = true;
      return true;
    } catch (error) {
      disable(error?.code === "DINE_ARCHIVE_STATE" ? "persistence_archive_state_unverified" : "persistence_filesystem_error");
      return false;
    }
  };

  const rotate = () => {
    for (let index = boundedArchives; index >= 1; index -= 1) {
      const from = index === 1 ? activePath : `${activePath}.${index - 1}`;
      const to = `${activePath}.${index}`;
      if (!fsModule.existsSync(from)) continue;
      if (fsModule.existsSync(to)) {
        if (!assertNoLink(fsModule, to).isFile()) throw new Error("Unexpected archive path type.");
        fsModule.unlinkSync(to);
      }
      fsModule.renameSync(from, to);
    }
  };

  const recordUnlocked = (event, fields) => {
    if (!prepare()) return false;
    try {
      const line = `${JSON.stringify({ timestamp: now().toISOString(), event, ...safeFields(fields) })}\n`;
      const { files } = expectedFiles(path.resolve(targetDirectory));
      for (const file of files) assertNoLink(fsModule, file);
      const currentSize = fsModule.statSync(activePath).size;
      if (currentSize + Buffer.byteLength(line) > boundedFileBytes) rotate();
      fsModule.appendFileSync(activePath, line, { encoding: "utf8", mode: 0o600 });
      return true;
    } catch {
      disable("persistence_filesystem_error");
      return false;
    }
  };

  const record = async (event, fields = {}) => {
    if (!EVENTS.has(event)) return false;
    if (!targetDirectory || !path.isAbsolute(targetDirectory)) return recordUnlocked(event, fields);
    try {
      const lockedResult = await withLock(path.resolve(targetDirectory), () => recordUnlocked(event, fields));
      if (!lockedResult?.acquired) {
        // Lock contention, timeout, or an unavailable lock helper is transient;
        // do not permanently disable persistence or steal a possibly live lock.
        return false;
      }
      return lockedResult.value;
    } catch {
      return false;
    }
  };

  return {
    record,
    get status() { return { enabled: ready, disabledReason }; },
    get path() { return activePath; },
  };
};

const safeEmit = (log, level, message, fields) => {
  try { log?.[level]?.(message, fields); } catch { /* Diagnostics must not affect application behavior. */ }
};

export const createDineExpiryDiagnostics = ({
  log,
  sink = createDineExpiryLogSink({
    onPersistenceDisabled: (reason) => safeEmit(log, "warn", "Dine expiry persistent diagnostics disabled.", { category: reason }),
  }),
} = {}) => ({
  async record(event, fields = {}) {
    try {
      if (await sink.record(event, fields)) return true;
    } catch { /* The sink is defensive; retain the fallback guarantee if a mock is not. */ }
    const level = event === "check-failed" || event === "expiry-failed" ? "error" : "warn";
    safeEmit(log, level, `Dine expiry diagnostic: ${event}.`, safeFields(fields));
    return false;
  },
});
