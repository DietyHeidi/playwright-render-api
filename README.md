# Playwright Render API

Pixel-perfect PDF/PNG render service using Playwright and Chromium.

## Features

- **PDF Rendering**: Generate A4/Letter PDFs from React routes
- **Image Rendering**: Generate PNG/JPEG/WebP screenshots with exact dimensions
- **URL-based Rendering**: Navigate to React render routes for pixel-perfect output
- **Supabase Storage**: Auto-upload results with signed URLs
- **Concurrency Control**: Configurable job limits to prevent server overload
- **API Key Auth**: Secure access to render endpoints
- **Health Checks**: Ready for Docker/Kubernetes deployments

## API Endpoints

### Health Check

```
GET /health          # Full health status
GET /health/ready    # Readiness probe
GET /health/live     # Liveness probe
```

### Render PDF

```http
POST /render/pdf
X-API-Key: your-api-key
Content-Type: application/json

{
  "url": "/render/a4/invoice-123",
  "paperSize": "A4",
  "orientation": "portrait",
  "printBackground": true,
  "margins": {
    "top": "20mm",
    "bottom": "20mm",
    "left": "15mm",
    "right": "15mm"
  },
  "uploadToStorage": true,
  "storagePath": "org-123/invoices"
}
```

### Render Image

```http
POST /render/image
X-API-Key: your-api-key
Content-Type: application/json

{
  "url": "/render/social/post-456",
  "format": "png",
  "width": 1080,
  "height": 1920,
  "scale": 1,
  "uploadToStorage": true,
  "storagePath": "org-123/social"
}
```

### Response

```json
{
  "success": true,
  "jobId": "abc123",
  "url": "https://xxx.supabase.co/storage/v1/object/sign/renders/...",
  "filename": "render-2026-02-02T10-30-00.pdf",
  "fileSize": 123456,
  "expiresAt": "2026-02-02T11:30:00.000Z",
  "metadata": {
    "renderTimeMs": 2500,
    "format": "pdf"
  }
}
```

## Setup

### Local Development

1. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. Start dev server:
   ```bash
   npm run dev
   ```

### Docker Deployment

1. Build and run:
   ```bash
   docker-compose up -d --build
   ```

2. Check health:
   ```bash
   curl http://localhost:3001/health
   ```

### Hostinger VPS Deployment

1. Run initial setup (once):
   ```bash
   sudo ./scripts/setup-vps.sh
   ```

2. Clone repository:
   ```bash
   cd /opt/playwright-render-api
   git clone <your-repo> .
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   nano .env
   ```

4. Deploy:
   ```bash
   sudo ./scripts/deploy.sh --build
   ```

## React App Integration

Your React app needs render routes that:

1. Have no app shell (no navigation, no sidebar)
2. Set `window.__RENDER_READY__ = true` when ready

Example:

```tsx
// /render/a4/:docId route
export function A4RenderRoute() {
  const { docId } = useParams();
  const { data, isLoading } = useDocument(docId);

  useEffect(() => {
    if (!isLoading && data) {
      // Wait for fonts
      document.fonts.ready.then(() => {
        // Signal render ready
        (window as any).__RENDER_READY__ = true;
      });
    }
  }, [isLoading, data]);

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="a4-page">
      {/* Your document content */}
    </div>
  );
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `API_KEY` | API authentication key | Required |
| `SUPABASE_URL` | Supabase project URL | Required |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Required |
| `STORAGE_BUCKET` | Storage bucket name | `renders` |
| `REACT_APP_URL` | React app base URL | Required |
| `MAX_CONCURRENT_JOBS` | Max parallel renders | `2` |
| `RENDER_TIMEOUT_MS` | Total render timeout | `30000` |

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Client    │────▶│ Playwright API   │────▶│  React App  │
│  (n8n/App)  │     │   (this service) │     │  /render/*  │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                            ▼
                    ┌──────────────────┐
                    │ Supabase Storage │
                    │   (signed URLs)  │
                    └──────────────────┘
```

## License

MIT
