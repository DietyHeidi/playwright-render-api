import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { RenderErrorResponse } from "../types/index.js";

/**
 * API Key authentication middleware
 *
 * Expects the API key in one of these locations:
 * - Header: X-API-Key
 * - Header: Authorization: Bearer <key>
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKeyHeader = req.headers["x-api-key"];
  const authHeader = req.headers.authorization;

  let providedKey: string | undefined;

  // Check X-API-Key header first
  if (typeof apiKeyHeader === "string") {
    providedKey = apiKeyHeader;
  }
  // Fall back to Authorization header
  else if (authHeader?.startsWith("Bearer ")) {
    providedKey = authHeader.slice(7);
  }

  if (!providedKey) {
    logger.warn("Request rejected: No API key provided", {
      ip: req.ip,
      path: req.path,
    });

    const response: RenderErrorResponse = {
      success: false,
      error: "UNAUTHORIZED",
      message: "API key required. Provide via X-API-Key header or Authorization: Bearer <key>",
    };

    res.status(401).json(response);
    return;
  }

  if (providedKey !== env.API_KEY) {
    logger.warn("Request rejected: Invalid API key", {
      ip: req.ip,
      path: req.path,
    });

    const response: RenderErrorResponse = {
      success: false,
      error: "FORBIDDEN",
      message: "Invalid API key",
    };

    res.status(403).json(response);
    return;
  }

  next();
}
