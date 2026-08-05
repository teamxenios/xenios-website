/**
 * Turns a Private Early Access password into the hash the deployment stores.
 *
 * Run it locally, paste the OUTPUT into the host's environment as
 * RESEARCH_EARLY_ACCESS_PASSWORD_HASH, and give the PASSWORD itself to invited
 * members through whatever channel you already use for that. The password never
 * needs to reach this repository, a log, a chat, or anyone reviewing the
 * deployment.
 *
 *   npx tsx scripts/hash-early-access-password.ts
 *
 * It reads the password from STDIN, not from an argument. An argument would sit
 * in shell history and be visible in the process list to anything running on the
 * same machine. It prints the hash and nothing else, so the output can be piped
 * or copied without carrying a stray secret along with it.
 */

import { hashPrivateAccessPassword } from "../server/research/early-access/private-access-password";

const MIN_LENGTH = 12;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) {
    process.stderr.write(
      "Enter the Early Access password, then press Enter and Ctrl+D (Ctrl+Z on Windows).\n" +
        "It is read from stdin so it never reaches your shell history.\n",
    );
  }

  // Only the trailing newline the terminal adds is stripped. A password may
  // legitimately contain spaces, and trimming them would hash something the
  // member never types.
  const password = (await readStdin()).replace(/\r?\n$/, "");

  if (password.length === 0) {
    process.stderr.write("No password was read from stdin. Nothing was hashed.\n");
    process.exitCode = 1;
    return;
  }
  if (password.length < MIN_LENGTH) {
    process.stderr.write(
      `That password is ${password.length} characters. Use at least ${MIN_LENGTH}. ` +
        "Nothing was hashed.\n",
    );
    process.exitCode = 1;
    return;
  }

  // The default cost, which is the production cost. The reduced cost used in
  // tests is deliberately not reachable from here.
  const hash = hashPrivateAccessPassword(password);

  // stdout carries the hash alone. Everything else goes to stderr so that
  // piping this into a file or a clipboard cannot pick up commentary.
  process.stdout.write(`${hash}\n`);
  process.stderr.write(
    "\nSet this as RESEARCH_EARLY_ACCESS_PASSWORD_HASH in the host environment.\n" +
      "Do not commit it, and do not paste the PASSWORD anywhere it will be stored.\n",
  );
}

void main();
