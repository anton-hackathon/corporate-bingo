import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "./env";

// The feed card is at most 540px wide (.feed in globals.css), so 1080 covers a
// 2× screen with nothing to spare and nothing wasted. There is no full-size
// view anywhere in the app, so storing anything larger only costs bandwidth:
// on a real upload 1600px was 752 KB against 238 KB at 1080.
const MAX_SIDE = 1080;

/**
 * Converts an uploaded image to webp no wider than MAX_SIDE and strips
 * metadata. Dropping EXIF is not only about size: the capture coordinates go
 * with it. A 12 MP phone photo lands around a couple of hundred kilobytes.
 */
export async function normalizeImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate() // apply the EXIF orientation before the EXIF block is dropped
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}

async function s3Client() {
  // Imported inside the function: the SDK is not needed in local mode, and in
  // local mode it is never pulled into the running process at all.
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: env.storage.region,
    endpoint: env.storage.endpoint || undefined,
    forcePathStyle: Boolean(env.storage.endpoint),
    credentials: { accessKeyId: env.storage.accessKey, secretAccessKey: env.storage.secretKey },
  });
}

export async function putImage(buffer: Buffer): Promise<string> {
  const key = `proofs/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.webp`;

  if (env.storage.driver === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3Client()).send(
      new PutObjectCommand({
        Bucket: env.storage.bucket,
        Key: key,
        Body: buffer,
        ContentType: "image/webp",
      }),
    );
    return key;
  }

  const full = path.resolve(localRoot(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buffer);
  return key;
}

/**
 * Where proofs live on disk.
 *
 * STORAGE_LOCAL_DIR is relative in development ("./.uploads") and absolute in
 * the Docker stack ("/app/.uploads"), and `resolve` is what handles both: it
 * ignores the base when the second argument is already absolute. `join` does
 * not, and gluing the two together produced "/app/app/.uploads" — a directory
 * the app user may not even create. Everything goes through here so the read
 * and write paths cannot drift apart again.
 */
function localRoot(): string {
  return path.resolve(process.cwd(), env.storage.localDir);
}

const KEY_SHAPE = /^proofs\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.webp$/;

export async function readImage(key: string): Promise<Buffer> {
  // Validated for both drivers: the key arrives from the URL, not the database,
  // whatever the comment below used to claim.
  if (!KEY_SHAPE.test(key)) throw new Error("Invalid file key");

  if (env.storage.driver === "s3") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const res = await (await s3Client()).send(
      new GetObjectCommand({ Bucket: env.storage.bucket, Key: key }),
    );
    const chunks: Buffer[] = [];
    for await (const chunk of res.Body as AsyncIterable<Buffer>) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  const root = localRoot();
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid file key");
  return readFile(full);
}

/**
 * Removes a stored proof. Called when HR revokes one: the record going away
 * is not enough if the file is still served from its URL.
 */
export async function deleteImage(key: string): Promise<void> {
  try {
    if (env.storage.driver === "s3") {
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await s3Client()).send(new DeleteObjectCommand({ Bucket: env.storage.bucket, Key: key }));
      return;
    }
    const root = localRoot();
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) return;
    await unlink(full);
  } catch {
    // A missing file is fine; anything else should not block the revoke.
  }
}

/** Proofs are served through the app rather than straight from the bucket, so the session check applies. */
export function imageUrl(key: string): string {
  return `/api/uploads/${key}`;
}
