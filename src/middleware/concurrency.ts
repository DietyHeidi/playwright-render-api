import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { RenderErrorResponse, RenderJob } from "../types/index.js";

// In-memory job tracking
const activeJobs = new Map<string, RenderJob>();

/**
 * Get current active job count
 */
export function getActiveJobCount(): number {
  return activeJobs.size;
}

/**
 * Get all active jobs
 */
export function getActiveJobs(): RenderJob[] {
  return Array.from(activeJobs.values());
}

/**
 * Register a new job
 */
export function registerJob(job: RenderJob): void {
  activeJobs.set(job.id, job);
  logger.debug(`Job registered: ${job.id}`, {
    type: job.type,
    activeJobs: activeJobs.size,
  });
}

/**
 * Update job status
 */
export function updateJobStatus(jobId: string, status: RenderJob["status"]): void {
  const job = activeJobs.get(jobId);
  if (job) {
    job.status = status;
  }
}

/**
 * Remove a completed/failed job
 */
export function removeJob(jobId: string): void {
  activeJobs.delete(jobId);
  logger.debug(`Job removed: ${jobId}`, { activeJobs: activeJobs.size });
}

/**
 * Middleware to enforce concurrency limits
 */
export function concurrencyLimit(req: Request, res: Response, next: NextFunction): void {
  if (activeJobs.size >= env.MAX_CONCURRENT_JOBS) {
    logger.warn("Concurrency limit reached", {
      activeJobs: activeJobs.size,
      maxConcurrent: env.MAX_CONCURRENT_JOBS,
      ip: req.ip,
    });

    const response: RenderErrorResponse = {
      success: false,
      error: "CONCURRENCY_LIMIT",
      message: `Server is at capacity. Max ${env.MAX_CONCURRENT_JOBS} concurrent jobs allowed. Please retry later.`,
      details: {
        activeJobs: activeJobs.size,
        maxConcurrent: env.MAX_CONCURRENT_JOBS,
      },
    };

    res.status(503).json(response);
    return;
  }

  next();
}
