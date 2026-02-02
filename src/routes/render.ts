import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { ZodError } from "zod";
import {
  PdfRenderRequestSchema,
  ImageRenderRequestSchema,
  type RenderSuccessResponse,
  type RenderErrorResponse,
  type RenderJob,
} from "../types/index.js";
import { renderPdf, renderImage } from "../services/playwright.js";
import { uploadFile } from "../services/storage.js";
import { env } from "../config/env.js";
import { createJobLogger } from "../utils/logger.js";
import {
  registerJob,
  removeJob,
  updateJobStatus,
} from "../middleware/concurrency.js";

export const renderRouter = Router();

/**
 * POST /render/pdf
 * Render a URL to PDF
 */
renderRouter.post("/pdf", async (req: Request, res: Response) => {
  const jobId = uuidv4();
  const jobLogger = createJobLogger(jobId);
  const startTime = Date.now();

  const job: RenderJob = {
    id: jobId,
    type: "pdf",
    url: req.body?.url || "unknown",
    startedAt: new Date(),
    status: "pending",
  };

  try {
    // Validate request
    const request = PdfRenderRequestSchema.parse(req.body);
    job.url = request.url;

    // Register job
    registerJob(job);
    updateJobStatus(jobId, "rendering");

    jobLogger.info("Starting PDF render", { url: request.url });

    // Render PDF
    const pdfBuffer = await renderPdf(request, jobId);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = request.filename
      ? `${request.filename}.pdf`
      : `render-${timestamp}.pdf`;

    let response: RenderSuccessResponse;

    if (request.uploadToStorage) {
      updateJobStatus(jobId, "uploading");

      // Upload to Supabase Storage
      const uploadResult = await uploadFile(
        pdfBuffer,
        filename,
        "application/pdf",
        request.storagePath,
        jobId
      );

      response = {
        success: true,
        jobId,
        url: uploadResult.signedUrl,
        filename,
        fileSize: pdfBuffer.length,
        expiresAt: uploadResult.expiresAt,
        metadata: {
          renderTimeMs: Date.now() - startTime,
          format: "pdf",
        },
      };
    } else {
      // Return as base64 data URL
      response = {
        success: true,
        jobId,
        dataUrl: `data:application/pdf;base64,${pdfBuffer.toString("base64")}`,
        filename,
        fileSize: pdfBuffer.length,
        metadata: {
          renderTimeMs: Date.now() - startTime,
          format: "pdf",
        },
      };
    }

    updateJobStatus(jobId, "completed");
    jobLogger.info("PDF render completed", {
      renderTimeMs: response.metadata.renderTimeMs,
      fileSize: response.fileSize,
    });

    res.json(response);
  } catch (error) {
    updateJobStatus(jobId, "failed");

    const errorResponse = handleRenderError(error, jobId, jobLogger);
    res.status(getStatusCode(errorResponse.error)).json(errorResponse);
  } finally {
    removeJob(jobId);
  }
});

/**
 * POST /render/image
 * Render a URL to image (PNG/JPEG/WebP)
 */
renderRouter.post("/image", async (req: Request, res: Response) => {
  const jobId = uuidv4();
  const jobLogger = createJobLogger(jobId);
  const startTime = Date.now();

  const job: RenderJob = {
    id: jobId,
    type: "image",
    url: req.body?.url || "unknown",
    startedAt: new Date(),
    status: "pending",
  };

  try {
    // Validate request
    const request = ImageRenderRequestSchema.parse(req.body);
    job.url = request.url;

    // Register job
    registerJob(job);
    updateJobStatus(jobId, "rendering");

    jobLogger.info("Starting image render", {
      url: request.url,
      format: request.format,
      dimensions: `${request.width}x${request.height}`,
    });

    // Render image
    const imageBuffer = await renderImage(request, jobId);

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = request.format;
    const filename = request.filename
      ? `${request.filename}.${extension}`
      : `render-${timestamp}.${extension}`;

    // Determine content type
    const contentType =
      request.format === "jpeg"
        ? "image/jpeg"
        : request.format === "webp"
          ? "image/webp"
          : "image/png";

    let response: RenderSuccessResponse;

    if (request.uploadToStorage) {
      updateJobStatus(jobId, "uploading");

      // Upload to Supabase Storage
      const uploadResult = await uploadFile(
        imageBuffer,
        filename,
        contentType,
        request.storagePath,
        jobId
      );

      response = {
        success: true,
        jobId,
        url: uploadResult.signedUrl,
        filename,
        fileSize: imageBuffer.length,
        expiresAt: uploadResult.expiresAt,
        metadata: {
          renderTimeMs: Date.now() - startTime,
          format: request.format,
          width: request.width,
          height: request.height,
        },
      };
    } else {
      // Return as base64 data URL
      response = {
        success: true,
        jobId,
        dataUrl: `data:${contentType};base64,${imageBuffer.toString("base64")}`,
        filename,
        fileSize: imageBuffer.length,
        metadata: {
          renderTimeMs: Date.now() - startTime,
          format: request.format,
          width: request.width,
          height: request.height,
        },
      };
    }

    updateJobStatus(jobId, "completed");
    jobLogger.info("Image render completed", {
      renderTimeMs: response.metadata.renderTimeMs,
      fileSize: response.fileSize,
      format: request.format,
    });

    res.json(response);
  } catch (error) {
    updateJobStatus(jobId, "failed");

    const errorResponse = handleRenderError(error, jobId, jobLogger);
    res.status(getStatusCode(errorResponse.error)).json(errorResponse);
  } finally {
    removeJob(jobId);
  }
});

/**
 * Convert error to RenderErrorResponse
 */
function handleRenderError(
  error: unknown,
  jobId: string,
  jobLogger: ReturnType<typeof createJobLogger>
): RenderErrorResponse {
  // Validation error
  if (error instanceof ZodError) {
    jobLogger.warn("Validation failed", { errors: error.errors });
    return {
      success: false,
      error: "VALIDATION_FAILED",
      message: "Invalid request data",
      jobId,
      details: { errors: error.errors },
    };
  }

  // Known error types
  if (error instanceof Error) {
    const message = error.message;

    if (message.includes("READY_FLAG_TIMEOUT")) {
      jobLogger.error("Ready flag timeout", { message });
      return {
        success: false,
        error: "READY_FLAG_TIMEOUT",
        message: "Page did not signal render ready in time. Ensure __RENDER_READY__ is set.",
        jobId,
      };
    }

    if (message.includes("NAVIGATION_TIMEOUT") || message.includes("Timeout")) {
      jobLogger.error("Navigation timeout", { message });
      return {
        success: false,
        error: "NAVIGATION_TIMEOUT",
        message: "Page navigation timed out",
        jobId,
      };
    }

    if (message.includes("STORAGE_FAILED")) {
      jobLogger.error("Storage error", { message });
      return {
        success: false,
        error: "STORAGE_FAILED",
        message: message.replace("STORAGE_FAILED: ", ""),
        jobId,
      };
    }

    // Unknown error
    jobLogger.error("Render failed", { error: message, stack: error.stack });
    return {
      success: false,
      error: "RENDER_FAILED",
      message: env.NODE_ENV === "production" ? "Render failed" : message,
      jobId,
    };
  }

  // Fallback
  jobLogger.error("Unknown error", { error });
  return {
    success: false,
    error: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
    jobId,
  };
}

/**
 * Get HTTP status code for error type
 */
function getStatusCode(error: RenderErrorResponse["error"]): number {
  switch (error) {
    case "VALIDATION_FAILED":
      return 400;
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "CONCURRENCY_LIMIT":
      return 503;
    case "READY_FLAG_TIMEOUT":
    case "NAVIGATION_TIMEOUT":
      return 408;
    case "STORAGE_FAILED":
    case "RENDER_FAILED":
    case "INTERNAL_ERROR":
    default:
      return 500;
  }
}
