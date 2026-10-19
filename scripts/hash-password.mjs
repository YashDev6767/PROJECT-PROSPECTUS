#!/usr/bin/env node
/**
 * Prints a scrypt password hash for AUTH_USERS (same format as api/src/services/auth.ts).
 *   npm run auth:hash -- 'a long passphrase'      (or:  echo 'a long passphrase' | npm run auth:hash -- --stdin)
 * Put the output in .env as the "passwordHash" of an account — never commit real passwords or .env.
 */
import { randomBytes, scryptSync } from "node:crypto";

const arg = process.argv[2];
let password = arg;
if (arg === "--stdin") {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  password = Buffer.concat(chunks).toString().replace(/\r?\n$/, "");
}
if (!password || password.length < 10) {
  console.error("Usage: npm run auth:hash -- '<password of at least 10 characters>'   (or --stdin)");
  process.exit(1);
}
const salt = randomBytes(16);
console.log(`scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`);
