# Use official Playwright image with all browsers pre-installed
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

# Set working directory
WORKDIR /app

# Install Node.js dependencies first (for better caching)
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Install dev dependencies for build
RUN npm ci

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Create non-root user for security
RUN groupadd -r renderuser && useradd -r -g renderuser renderuser
RUN chown -R renderuser:renderuser /app
USER renderuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3001/health/live || exit 1

# Start the server
CMD ["node", "dist/index.js"]
