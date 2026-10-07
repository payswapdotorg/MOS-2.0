/**
 * Tests for the WORKING ObjectStoragePort adapter (in-memory + file).
 *
 * W0-B / BOOT-003 — node:test, zero new dependencies.
 * Covers: put/get/delete roundtrips (text + binary), digest stability
 * (cross-instance, cross-restart, known sha256 vectors), scope isolation,
 * idempotent puts, buffer isolation, integrity verification (tamper
 * detection), scope validation, and error contracts.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deepEqual, equal, ok, rejects } from "node:assert/strict";
import test from "node:test";
import {
  createFileObjectStorage,
  createInMemoryObjectStorage,
  DigestMismatchError,
  InvalidStorageScopeError,
  ObjectNotFoundError,
  type ObjectStoragePort,
} from "../src/index.ts";

// sha256("")  = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
// sha256("hello mos") — computed once, asserted as a stability vector below.
const SHA256_EMPTY = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const factories: ReadonlyArray<[string, () => ObjectStoragePort | Promise<ObjectStoragePort>]> = [
  ["in-memory", () => createInMemoryObjectStorage()],
  ["file", async () => createFileObjectStorage(await mkdtemp(join(tmpdir(), "mos-objects-")))],
];

for (const [name, makeStorage] of factories) {
  test(`[${name}] put/get/delete roundtrip with text content`, async () => {
    const storage = await makeStorage();
    const stored = await storage.put({
      scope: "tenant-1",
      bytes: "hello mos",
      contentType: "text/plain",
      metadata: { origin: "test" },
    });
    equal(stored.size, 9);
    equal(stored.contentType, "text/plain");
    deepEqual(stored.metadata, { origin: "test" });
    const bytes = await storage.get(stored.ref);
    equal(new TextDecoder().decode(bytes), "hello mos");
    equal(await storage.delete(stored.ref), true);
    await rejects(storage.get(stored.ref), ObjectNotFoundError);
    equal(await storage.delete(stored.ref), false);
  });

  test(`[${name}] binary bytes roundtrip including NUL and 0xff`, async () => {
    const storage = await makeStorage();
    const payload = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xfe, 0xff]);
    const stored = await storage.put({ scope: "binary", bytes: payload });
    const bytes = await storage.get(stored.ref);
    deepEqual([...bytes], [...payload]);
  });

  test(`[${name}] digest stability: identical bytes -> identical digest`, async () => {
    const storage = await makeStorage();
    const a = await storage.put({ scope: "stable", bytes: "same-content" });
    const b = await storage.put({ scope: "stable", bytes: "same-content" });
    equal(a.ref.digest, b.ref.digest);
    equal(a.storedAt, b.storedAt);
    const other = await makeStorage();
    const c = await other.put({ scope: "stable", bytes: "same-content" });
    equal(c.ref.digest, a.ref.digest);
    const different = await storage.put({ scope: "stable", bytes: "same-content " });
    notEqualHelper(different.ref.digest, a.ref.digest);
  });

  test(`[${name}] digest is sha256 with algorithm prefix (known vectors)`, async () => {
    const storage = await makeStorage();
    const empty = await storage.put({ scope: "vectors", bytes: "" });
    equal(empty.ref.digest, SHA256_EMPTY);
    equal(empty.size, 0);
    ok(empty.ref.digest.startsWith("sha256:"));
    const hello = await storage.put({ scope: "vectors", bytes: "hello mos" });
    // Known-good sha256("hello mos"), computed independently of this adapter.
    equal(hello.ref.digest, "sha256:26279f0e1eb97ad387ccf6d0857fd945606d627882fd5c6a1e0b6728ef64acca");
  });

  test(`[${name}] scope isolation: same content, different scopes are distinct refs`, async () => {
    const storage = await makeStorage();
    const inA = await storage.put({ scope: "tenant-a", bytes: "shared bytes" });
    const inB = await storage.put({ scope: "tenant-b", bytes: "shared bytes" });
    equal(inA.ref.digest, inB.ref.digest);
    notEqualHelper(inA.ref.scope, inB.ref.scope);
    equal(new TextDecoder().decode(await storage.get(inA.ref)), "shared bytes");
    equal(new TextDecoder().decode(await storage.get(inB.ref)), "shared bytes");
    // A digest alone cannot cross scopes: correct digest, wrong scope misses.
    await rejects(storage.get({ scope: "tenant-c", digest: inA.ref.digest }), ObjectNotFoundError);
  });

  test(`[${name}] idempotent put keeps first-write metadata`, async () => {
    const storage = await makeStorage();
    const first = await storage.put({
      scope: "idempotent",
      bytes: "content",
      metadata: { version: "first" },
    });
    const second = await storage.put({
      scope: "idempotent",
      bytes: "content",
      metadata: { version: "second" },
    });
    deepEqual(second.metadata, { version: "first" });
    equal(second.storedAt, first.storedAt);
  });

  test(`[${name}] buffer isolation: mutating input after put does not change stored bytes`, async () => {
    const storage = await makeStorage();
    const input = new Uint8Array([1, 2, 3]);
    const stored = await storage.put({ scope: "isolation", bytes: input });
    input[0] = 255;
    const read = await storage.get(stored.ref);
    deepEqual([...read], [1, 2, 3]);
    read[1] = 200;
    const readAgain = await storage.get(stored.ref);
    deepEqual([...readAgain], [1, 2, 3]);
  });

  test(`[${name}] invalid scope rejected before any IO`, async () => {
    const storage = await makeStorage();
    for (const bad of ["UPPER", "..", "a/../b", "", "-leading", "/leading", "a//b"]) {
      await rejects(storage.put({ scope: bad, bytes: "x" }), InvalidStorageScopeError);
    }
    // Multi-segment scopes are legal.
    const okScope = await storage.put({ scope: "tenant-1/workspace-2", bytes: "x" });
    equal(okScope.ref.scope, "tenant-1/workspace-2");
  });

  test(`[${name}] get on unknown digest throws ObjectNotFoundError`, async () => {
    const storage = await makeStorage();
    await rejects(
      storage.get({ scope: "missing", digest: SHA256_EMPTY }),
      ObjectNotFoundError,
    );
  });
}

function notEqualHelper(a: unknown, b: unknown): void {
  ok(a !== b, `expected ${String(a)} !== ${String(b)}`);
}

test("[file] restart stability: new instance over same rootDir sees identical content + digest", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "mos-objects-restart-"));
  const first = createFileObjectStorage(rootDir);
  const stored = await first.put({
    scope: "durable",
    bytes: "survives restarts",
    contentType: "text/plain",
    metadata: { provenance: "test" },
  });
  const second = createFileObjectStorage(rootDir);
  const reread = await second.get(stored.ref);
  equal(new TextDecoder().decode(reread), "survives restarts");
  const reput = await second.put({ scope: "durable", bytes: "survives restarts" });
  equal(reput.ref.digest, stored.ref.digest);
  equal(reput.storedAt, stored.storedAt);
  equal(reput.contentType, "text/plain");
  deepEqual(reput.metadata, { provenance: "test" });
  await rm(rootDir, { recursive: true, force: true });
});

test("[file] tampered blob is detected via digest verification", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "mos-objects-tamper-"));
  const storage = createFileObjectStorage(rootDir);
  const stored = await storage.put({ scope: "tamper", bytes: "authentic content" });
  // Corrupt the stored blob out-of-band (test knows the file layout
  // rootDir/<scope>/<digest[0:2]>/<digest>).
  const { writeFile } = await import("node:fs/promises");
  const hex = stored.ref.digest.slice("sha256:".length);
  await writeFile(join(rootDir, "tamper", hex.slice(0, 2), hex), "tampered content");
  await rejects(storage.get(stored.ref), DigestMismatchError);
  await rm(rootDir, { recursive: true, force: true });
});

test("[in-memory] constructor-level sanity: distinct instances do not share state", async () => {
  const a = createInMemoryObjectStorage();
  const b = createInMemoryObjectStorage();
  const stored = await a.put({ scope: "s", bytes: "only-in-a" });
  await rejects(b.get(stored.ref), ObjectNotFoundError);
});

test("port errors are distinguishable by code and carry detail", () => {
  const ref = { scope: "s", digest: SHA256_EMPTY };
  const notFound = new ObjectNotFoundError(ref);
  equal(notFound.code, "MOS_OBJECT_NOT_FOUND");
  ok(notFound.message.includes('"s"'));
  equal(new DigestMismatchError(ref, "sha256:ff").code, "MOS_DIGEST_MISMATCH");
  const badScope = new InvalidStorageScopeError("..", "bad");
  equal(badScope.code, "MOS_INVALID_STORAGE_SCOPE");
  ok(badScope.message.includes(".."));
});
