// Tiny file-backed JSON store. Not production-grade — this is a demo agent,
// and the point is readable, inspectable state, not a real database.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const CASE_NOTES_DIR = path.join(__dirname, "..", "case-notes");

async function readJson(file, fallback) {
  try {
    const raw = await readFile(path.join(DATA_DIR, file), "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf8");
}

export async function getPolicies() {
  return readJson("policies.json", {});
}

export async function getPolicy(policyId) {
  const policies = await getPolicies();
  return policies[policyId] || null;
}

export async function getClaims() {
  return readJson("claims.json", {});
}

export async function saveClaim(claim) {
  const claims = await getClaims();
  claims[claim.claim_id] = claim;
  await writeJson("claims.json", claims);
  return claim;
}

export async function getClaim(claimId) {
  const claims = await getClaims();
  return claims[claimId] || null;
}

export async function getLedger() {
  return readJson("ledger.json", []);
}

export async function appendLedgerEntry(entry) {
  const ledger = await getLedger();
  ledger.push(entry);
  await writeJson("ledger.json", ledger);
  return entry;
}

export async function writeCaseNote(claimId, markdown) {
  await mkdir(CASE_NOTES_DIR, { recursive: true });
  const filePath = path.join(CASE_NOTES_DIR, `${claimId}.md`);
  await writeFile(filePath, markdown, "utf8");
  return filePath;
}

const AUDIT_DIR = path.join(DATA_DIR, "audit");

export async function appendAudit(sessionId, record) {
  await mkdir(AUDIT_DIR, { recursive: true });
  const filePath = path.join(AUDIT_DIR, `${sessionId}.json`);
  let existing = [];
  try {
    existing = JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  existing.push({ ...record, recorded_at: new Date().toISOString() });
  await writeFile(filePath, JSON.stringify(existing, null, 2), "utf8");
  return existing;
}

export async function readAudit(sessionId) {
  const filePath = path.join(AUDIT_DIR, `${sessionId}.json`);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

// The OpenAI-style `messages` array (chat history) for one session, plus the
// claim_id pinned to it. Reloaded on every turn since the API is stateless.
const CONVERSATIONS_DIR = path.join(DATA_DIR, "conversations");

export async function getConversation(sessionId) {
  const filePath = path.join(CONVERSATIONS_DIR, `${sessionId}.json`);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw err;
  }
}

export async function saveConversation(sessionId, conversation) {
  await mkdir(CONVERSATIONS_DIR, { recursive: true });
  const filePath = path.join(CONVERSATIONS_DIR, `${sessionId}.json`);
  await writeFile(filePath, JSON.stringify(conversation, null, 2), "utf8");
  return conversation;
}
