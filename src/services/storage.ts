import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { createJobLogger } from "../utils/logger.js";

let supabase: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
export function initStorage(): void {
  if (supabase) return;

  // Skip initialization if credentials not provided (local testing mode)
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn("[Storage] Supabase credentials not configured - storage uploads disabled");
    return;
  }

  supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Check if storage is available
 */
export function isStorageAvailable(): boolean {
  return supabase !== null;
}

/**
 * Get the Supabase client
 */
function getClient(): SupabaseClient {
  if (!supabase) {
    throw new Error("STORAGE_FAILED: Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or use uploadToStorage: false");
  }
  return supabase;
}

export interface UploadResult {
  path: string;
  signedUrl: string;
  expiresAt: string;
}

/**
 * Upload a file to Supabase Storage and return a signed URL
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string,
  storagePath: string | undefined,
  jobId: string
): Promise<UploadResult> {
  const jobLogger = createJobLogger(jobId);
  const client = getClient();

  // Build full path
  const basePath = storagePath ? storagePath.replace(/^\/|\/$/g, "") : "";
  const fullPath = basePath ? `${basePath}/${filename}` : filename;

  jobLogger.info(`Uploading to storage: ${env.STORAGE_BUCKET}/${fullPath}`);

  // Upload file
  const { error: uploadError } = await client.storage
    .from(env.STORAGE_BUCKET)
    .upload(fullPath, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    jobLogger.error(`Storage upload failed: ${uploadError.message}`);
    throw new Error(`STORAGE_FAILED: ${uploadError.message}`);
  }

  // Generate signed URL
  const { data: signedUrlData, error: signedUrlError } = await client.storage
    .from(env.STORAGE_BUCKET)
    .createSignedUrl(fullPath, env.SIGNED_URL_EXPIRY_SECONDS);

  if (signedUrlError || !signedUrlData) {
    jobLogger.error(`Failed to create signed URL: ${signedUrlError?.message}`);
    throw new Error(`STORAGE_FAILED: Failed to create signed URL`);
  }

  const expiresAt = new Date(
    Date.now() + env.SIGNED_URL_EXPIRY_SECONDS * 1000
  ).toISOString();

  jobLogger.info(`File uploaded successfully, signed URL expires at ${expiresAt}`);

  return {
    path: fullPath,
    signedUrl: signedUrlData.signedUrl,
    expiresAt,
  };
}

/**
 * Delete a file from storage
 */
export async function deleteFile(path: string, jobId: string): Promise<void> {
  const jobLogger = createJobLogger(jobId);
  const client = getClient();

  const { error } = await client.storage.from(env.STORAGE_BUCKET).remove([path]);

  if (error) {
    jobLogger.warn(`Failed to delete file ${path}: ${error.message}`);
  } else {
    jobLogger.debug(`File deleted: ${path}`);
  }
}
