import winston from "winston";
import { env } from "../config/env.js";

const { combine, timestamp, printf, colorize, errors } = winston.format;

const logFormat = printf(({ level, message, timestamp, jobId, ...meta }) => {
  const jobPrefix = jobId ? `[${jobId}] ` : "";
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${timestamp} ${level}: ${jobPrefix}${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  format: combine(
    errors({ stack: true }),
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize({ all: env.NODE_ENV !== "production" }),
        logFormat
      ),
    }),
  ],
  defaultMeta: { service: "playwright-render-api" },
});

// Create a child logger with job context
export function createJobLogger(jobId: string) {
  return logger.child({ jobId });
}
