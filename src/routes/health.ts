import { Router } from "express";
import { getActiveJobCount, getActiveJobs } from "../middleware/concurrency.js";
import { env } from "../config/env.js";

export const healthRouter = Router();

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  jobs: {
    active: number;
    maxConcurrent: number;
    details?: Array<{
      id: string;
      type: string;
      status: string;
      startedAt: string;
    }>;
  };
}

const startTime = Date.now();

/**
 * GET /health
 * Health check endpoint
 */
healthRouter.get("/", (req, res) => {
  const activeJobs = getActiveJobCount();
  const isAtCapacity = activeJobs >= env.MAX_CONCURRENT_JOBS;

  const response: HealthResponse = {
    status: isAtCapacity ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || "1.0.0",
    environment: env.NODE_ENV,
    jobs: {
      active: activeJobs,
      maxConcurrent: env.MAX_CONCURRENT_JOBS,
    },
  };

  // Include job details in non-production for debugging
  if (env.NODE_ENV !== "production") {
    response.jobs.details = getActiveJobs().map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      startedAt: job.startedAt.toISOString(),
    }));
  }

  res.status(response.status === "healthy" ? 200 : 503).json(response);
});

/**
 * GET /health/ready
 * Readiness probe for Kubernetes/Docker
 */
healthRouter.get("/ready", (req, res) => {
  // Could add checks for browser, storage connection, etc.
  res.status(200).json({ ready: true });
});

/**
 * GET /health/live
 * Liveness probe for Kubernetes/Docker
 */
healthRouter.get("/live", (req, res) => {
  res.status(200).json({ alive: true });
});
