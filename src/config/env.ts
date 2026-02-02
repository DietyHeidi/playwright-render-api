import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // API Authentication
  API_KEY: z.string().min(1, "API_KEY is required"),

  // Supabase (optional for local testing without storage upload)
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL").optional().or(z.literal("")),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional().or(z.literal("")),

  // Storage
  STORAGE_BUCKET: z.string().default("renders"),
  SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().default(3600),

  // React App
  REACT_APP_URL: z.string().url("REACT_APP_URL must be a valid URL"),

  // Render Configuration
  MAX_CONCURRENT_JOBS: z.coerce.number().min(1).max(10).default(2),
  RENDER_TIMEOUT_MS: z.coerce.number().default(30000),
  NAVIGATION_TIMEOUT_MS: z.coerce.number().default(15000),
  READY_FLAG_TIMEOUT_MS: z.coerce.number().default(10000),

  // Chromium
  CHROMIUM_HEADLESS: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
  CHROMIUM_ARGS: z
    .string()
    .transform((v) => v.split(",").filter(Boolean))
    .default("--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("Environment validation failed:");
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
