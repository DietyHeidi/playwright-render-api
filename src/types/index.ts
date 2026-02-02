import { z } from "zod";

// ============================================================================
// Request Schemas
// ============================================================================

export const PdfRenderRequestSchema = z.object({
  /** URL path to render (e.g., /render/a4/invoice-123) */
  url: z.string().min(1),

  /** Optional authentication token to pass to the React app */
  authToken: z.string().optional(),

  /** Paper size */
  paperSize: z.enum(["A4", "Letter", "Legal"]).default("A4"),

  /** Page orientation */
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),

  /** Print background graphics */
  printBackground: z.boolean().default(true),

  /** Page margins */
  margins: z
    .object({
      top: z.string().default("20mm"),
      bottom: z.string().default("20mm"),
      left: z.string().default("15mm"),
      right: z.string().default("15mm"),
    })
    .default({}),

  /** Custom filename (without extension) */
  filename: z.string().optional(),

  /** Upload to Supabase Storage */
  uploadToStorage: z.boolean().default(true),

  /** Storage path prefix (e.g., org-id/documents) */
  storagePath: z.string().optional(),
});

export const ImageRenderRequestSchema = z.object({
  /** URL path to render (e.g., /render/social/post-123?size=1080x1920) */
  url: z.string().min(1),

  /** Optional authentication token to pass to the React app */
  authToken: z.string().optional(),

  /** Image format */
  format: z.enum(["png", "jpeg", "webp"]).default("png"),

  /** Image quality (1-100, only for jpeg/webp) */
  quality: z.number().min(1).max(100).default(90),

  /** Viewport width in pixels */
  width: z.number().min(1).max(4096).default(1080),

  /** Viewport height in pixels */
  height: z.number().min(1).max(4096).default(1080),

  /** Device scale factor (for retina) */
  scale: z.number().min(1).max(3).default(1),

  /** Custom filename (without extension) */
  filename: z.string().optional(),

  /** Upload to Supabase Storage */
  uploadToStorage: z.boolean().default(true),

  /** Storage path prefix */
  storagePath: z.string().optional(),
});

// ============================================================================
// Response Types
// ============================================================================

export interface RenderSuccessResponse {
  success: true;
  jobId: string;
  /** Signed URL for download (if uploaded to storage) */
  url?: string;
  /** Base64 data URL (if not uploaded to storage) */
  dataUrl?: string;
  filename: string;
  fileSize: number;
  /** URL expiry time (ISO 8601) */
  expiresAt?: string;
  metadata: {
    renderTimeMs: number;
    format: "pdf" | "png" | "jpeg" | "webp";
    pageCount?: number;
    width?: number;
    height?: number;
  };
}

export interface RenderErrorResponse {
  success: false;
  error: RenderErrorCode;
  message: string;
  jobId?: string;
  details?: Record<string, unknown>;
}

export type RenderErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RENDER_FAILED"
  | "READY_FLAG_TIMEOUT"
  | "NAVIGATION_TIMEOUT"
  | "STORAGE_FAILED"
  | "CONCURRENCY_LIMIT"
  | "INTERNAL_ERROR";

// ============================================================================
// Internal Types
// ============================================================================

export interface RenderJob {
  id: string;
  type: "pdf" | "image";
  url: string;
  startedAt: Date;
  status: "pending" | "rendering" | "uploading" | "completed" | "failed";
}

export type PdfRenderRequest = z.infer<typeof PdfRenderRequestSchema>;
export type ImageRenderRequest = z.infer<typeof ImageRenderRequestSchema>;
