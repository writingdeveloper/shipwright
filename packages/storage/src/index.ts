/**
 * @repo/storage — S3-compatible object storage (Cloudflare R2 / AWS S3 / MinIO).
 *
 * server-only: reads S3 secrets from @repo/env. GRACEFUL — with any S3 var unset
 * `isStorageConfigured()` is false and callers render a "not configured" card
 * instead of calling the presigned/delete helpers (which throw if used while
 * unconfigured). So the app, tests, and CI run with no bucket.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@repo/env";

/** Presigned URLs live 10 minutes — long enough to pick + PUT, short to leak. */
const PRESIGN_TTL_SECONDS = 600;

/** True only when EVERY S3 var is set. Guard every helper call with this. */
export function isStorageConfigured(): boolean {
  return Boolean(
    env.S3_ENDPOINT &&
      env.S3_REGION &&
      env.S3_ACCESS_KEY_ID &&
      env.S3_SECRET_ACCESS_KEY &&
      env.S3_BUCKET,
  );
}

let cached: S3Client | undefined;

function client(): S3Client {
  if (!isStorageConfigured()) {
    throw new Error(
      "@repo/storage: S3 is not configured (set S3_* env vars); guard with isStorageConfigured()",
    );
  }
  cached ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    // Path-style addressing works across S3 / R2 / MinIO uniformly.
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
    },
  });
  return cached;
}

/**
 * Presigned PUT URL the browser uploads to directly (no bytes through us).
 *
 * @param args.key         S3 object key.
 * @param args.contentType MIME type of the object being uploaded.
 * @param args.expiresIn   Seconds until the URL expires (default: {@link PRESIGN_TTL_SECONDS}).
 */
export async function createPresignedUploadUrl(args: {
  key: string;
  contentType: string;
  /** Seconds until the presigned URL expires. Defaults to {@link PRESIGN_TTL_SECONDS} (600 s). */
  expiresIn?: number;
}): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: args.key,
    ContentType: args.contentType,
  });
  return getSignedUrl(client(), command, {
    expiresIn: args.expiresIn ?? PRESIGN_TTL_SECONDS,
  });
}

/**
 * Presigned GET URL for downloading a private object.
 *
 * @param key       S3 object key.
 * @param expiresIn Seconds until the URL expires (default: {@link PRESIGN_TTL_SECONDS}).
 */
export async function createPresignedDownloadUrl(
  key: string,
  expiresIn = PRESIGN_TTL_SECONDS,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  return getSignedUrl(client(), command, { expiresIn });
}

/** Delete one object — called when the owner removes a file record. */
export async function deleteObject(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }),
  );
}
