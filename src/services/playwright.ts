import { chromium, Browser, BrowserContext, Page } from "playwright";
import { env } from "../config/env.js";
import { logger, createJobLogger } from "../utils/logger.js";
import type { PdfRenderRequest, ImageRenderRequest } from "../types/index.js";

let browser: Browser | null = null;

/**
 * Initialize the browser instance (called once at startup)
 */
export async function initBrowser(): Promise<void> {
  if (browser) {
    logger.warn("Browser already initialized, skipping");
    return;
  }

  logger.info("Initializing Chromium browser...");

  browser = await chromium.launch({
    headless: env.CHROMIUM_HEADLESS,
    args: env.CHROMIUM_ARGS,
  });

  logger.info("Chromium browser initialized successfully");
}

/**
 * Close the browser instance (called at shutdown)
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    logger.info("Closing Chromium browser...");
    await browser.close();
    browser = null;
    logger.info("Chromium browser closed");
  }
}

/**
 * Get the browser instance (throws if not initialized)
 */
function getBrowser(): Browser {
  if (!browser) {
    throw new Error("Browser not initialized. Call initBrowser() first.");
  }
  return browser;
}

/**
 * Build the full URL for rendering
 */
function buildRenderUrl(path: string, authToken?: string): string {
  const baseUrl = env.REACT_APP_URL.replace(/\/$/, "");
  const url = new URL(path.startsWith("/") ? path : `/${path}`, baseUrl);

  // Add auth token as query param if provided
  if (authToken) {
    url.searchParams.set("_renderToken", authToken);
  }

  return url.toString();
}

/**
 * Wait for the __RENDER_READY__ flag to be set by the React app
 */
async function waitForRenderReady(page: Page, jobId: string): Promise<void> {
  const jobLogger = createJobLogger(jobId);

  jobLogger.debug("Waiting for fonts to be ready...");
  await page.evaluate(() => document.fonts.ready);
  jobLogger.debug("Fonts ready");

  jobLogger.debug("Waiting for __RENDER_READY__ flag...");

  const result = await page.evaluate(
    (timeout) => {
      return new Promise<boolean>((resolve) => {
        // Check if already ready
        if ((window as unknown as { __RENDER_READY__?: boolean }).__RENDER_READY__) {
          resolve(true);
          return;
        }

        // Poll for the flag
        const startTime = Date.now();
        const interval = setInterval(() => {
          if ((window as unknown as { __RENDER_READY__?: boolean }).__RENDER_READY__) {
            clearInterval(interval);
            resolve(true);
          } else if (Date.now() - startTime > timeout) {
            clearInterval(interval);
            resolve(false);
          }
        }, 100);
      });
    },
    env.READY_FLAG_TIMEOUT_MS
  );

  if (!result) {
    throw new Error(
      `READY_FLAG_TIMEOUT: __RENDER_READY__ flag not set within ${env.READY_FLAG_TIMEOUT_MS}ms`
    );
  }

  jobLogger.debug("__RENDER_READY__ flag detected");

  // Small stabilization delay for any final CSS transitions
  await page.waitForTimeout(150);
}

/**
 * Render a page to PDF
 */
export async function renderPdf(
  request: PdfRenderRequest,
  jobId: string
): Promise<Buffer> {
  const jobLogger = createJobLogger(jobId);
  const browserInstance = getBrowser();

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Create isolated context
    context = await browserInstance.newContext({
      viewport: { width: 1200, height: 800 },
      deviceScaleFactor: 1,
    });

    page = await context.newPage();

    // Build URL and navigate
    const url = buildRenderUrl(request.url, request.authToken);
    jobLogger.info(`Navigating to: ${url}`);

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: env.NAVIGATION_TIMEOUT_MS,
    });

    // Wait for render ready signal
    await waitForRenderReady(page, jobId);

    // Generate PDF
    jobLogger.info("Generating PDF...");

    const pdfBuffer = await page.pdf({
      format: request.paperSize,
      landscape: request.orientation === "landscape",
      printBackground: request.printBackground,
      margin: {
        top: request.margins.top,
        bottom: request.margins.bottom,
        left: request.margins.left,
        right: request.margins.right,
      },
    });

    jobLogger.info(`PDF generated successfully (${pdfBuffer.length} bytes)`);

    return Buffer.from(pdfBuffer);
  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Render a page to image (PNG/JPEG/WebP)
 */
export async function renderImage(
  request: ImageRenderRequest,
  jobId: string
): Promise<Buffer> {
  const jobLogger = createJobLogger(jobId);
  const browserInstance = getBrowser();

  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    // Create isolated context with exact viewport size
    context = await browserInstance.newContext({
      viewport: {
        width: request.width,
        height: request.height,
      },
      deviceScaleFactor: request.scale,
    });

    page = await context.newPage();

    // Disable animations for deterministic rendering
    await page.emulateMedia({ reducedMotion: "reduce" });

    // Build URL and navigate
    const url = buildRenderUrl(request.url, request.authToken);
    jobLogger.info(`Navigating to: ${url}`);

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: env.NAVIGATION_TIMEOUT_MS,
    });

    // Wait for render ready signal
    await waitForRenderReady(page, jobId);

    // Generate screenshot
    jobLogger.info(`Generating ${request.format.toUpperCase()} screenshot...`);

    const screenshotBuffer = await page.screenshot({
      type: request.format === "jpeg" ? "jpeg" : request.format === "webp" ? "png" : "png",
      quality: request.format === "jpeg" ? request.quality : undefined,
      fullPage: false,
    });

    jobLogger.info(
      `Screenshot generated successfully (${screenshotBuffer.length} bytes)`
    );

    return Buffer.from(screenshotBuffer);
  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}
