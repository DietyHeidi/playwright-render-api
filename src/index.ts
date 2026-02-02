import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { initBrowser, closeBrowser } from "./services/playwright.js";
import { initStorage } from "./services/storage.js";
import { apiKeyAuth } from "./middleware/auth.js";
import { concurrencyLimit } from "./middleware/concurrency.js";
import { renderRouter } from "./routes/render.js";
import { healthRouter } from "./routes/health.js";

const app = express();

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// CORS - configure for your needs
app.use(
  cors({
    origin: env.NODE_ENV === "production" ? env.REACT_APP_URL : "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "X-API-Key", "Authorization"],
  })
);

// JSON body parser
app.use(express.json({ limit: "1mb" }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: Date.now() - start,
      ip: req.ip,
    });
  });
  next();
});

// ============================================================================
// Routes
// ============================================================================

// Health check (no auth required)
app.use("/health", healthRouter);

// Render endpoints (auth + concurrency limit)
app.use("/render", apiKeyAuth, concurrencyLimit, renderRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message:
        env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message,
    });
  }
);

// ============================================================================
// Server Lifecycle
// ============================================================================

async function start(): Promise<void> {
  try {
    logger.info("Starting Playwright Render API...");

    // Initialize services
    logger.info("Initializing services...");
    initStorage();
    await initBrowser();

    // Start HTTP server
    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`, {
        environment: env.NODE_ENV,
        maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
        reactAppUrl: env.REACT_APP_URL,
      });
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        logger.info("HTTP server closed");

        try {
          await closeBrowser();
          logger.info("Browser closed");
          process.exit(0);
        } catch (err) {
          logger.error("Error during shutdown", { error: err });
          process.exit(1);
        }
      });

      // Force exit after 10s
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    logger.error("Failed to start server", { error: err });
    process.exit(1);
  }
}

start();
