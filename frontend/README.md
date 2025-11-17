# Frontend Build Process

## Overview

The frontend supports both local Flask development and static deployment with dynamic API Gateway integration. The build system automatically configures API endpoints based on your deployment environment.

## Local Development

To run the Flask application locally for development:

```bash
python web.py
```

This serves the application with local API routes for development and testing.

## Building for Deployment

### Basic Build

```bash
python build.py
```

### Build with API Gateway Integration

```bash
# Build with specific API Gateway URL
python build.py --api-url "https://abc123.execute-api.us-east-1.amazonaws.com/api" --tier dev

# Build for specific tier (auto-detects API Gateway URL)
python build.py --tier qa
```

### Build Script Options

| Option      | Description                                       | Example                                                              |
| ----------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `--api-url` | API Gateway base URL to inject into configuration | `--api-url "https://abc123.execute-api.us-east-1.amazonaws.com/api"` |
| `--tier`    | Deployment tier (dev, qa, prod)                   | `--tier dev`                                                         |

## Build Process

The build script performs the following steps:

1. **Clean Build Directory**: Creates/cleans the `build/` directory
2. **Copy Static Assets**: Copies all CSS and JS files to `build/static/`
3. **Copy & Configure**: Copies config files and injects API Gateway URL if provided
4. **Process Templates**: Replaces Jinja2 `url_for()` calls with static paths
5. **Output Ready Assets**: Generates deployment-ready files in `build/`

## API Gateway Integration

### How It Works

The system dynamically configures API endpoints through configuration:

1. **Configuration Loading**: App loads `config/lfss.json` at startup
2. **API Initialization**: `initializeApiConfig()` reads the `api.baseUrl` setting
3. **Dynamic URLs**: All API calls use `buildApiUrl()` to construct complete URLs
4. **Fallback**: Falls back to relative paths for local development

### Route Mappings

| Local Flask Route                | API Gateway Endpoint              |
| -------------------------------- | --------------------------------- |
| `/list_of_families`              | `/families`                       |
| `/family/{family_id}`            | `/families/{family_id}`           |
| `/annotations/{family_id}`       | `/annotations/{family_id}`        |
| `/write_annotations/{family_id}` | `/annotations/{family_id}` (POST) |

### Configuration Format

```json
{
  "api": {
    "baseUrl": "https://abc123.execute-api.us-east-1.amazonaws.com/api"
  },
  "style": "compact"
  // ... other configuration
}
```

## Deployment Methods

### Option 1: GitHub Actions - Full Stack (Recommended)

Use the **"Deploy Full Stack"** workflow:

- ✅ Deploys API Gateway first
- ✅ Automatically captures API Gateway URL
- ✅ Builds frontend with correct API configuration
- ✅ Deploys to S3 and invalidates CloudFront

### Option 2: GitHub Actions - Individual Components

1. **Deploy API Gateway** workflow
2. **Deploy Frontend** workflow (auto-detects API Gateway URL)

### Option 3: Manual Deployment

```bash
# 1. Build with API Gateway URL
cd frontend
python build.py --api-url "$(aws cloudformation describe-stacks \
  --stack-name "dev-fhhpb-api-gateway" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiGatewayUrl'].OutputValue" \
  --output text)" --tier dev

# 2. Deploy to S3
aws s3 sync build/ s3://your-frontend-bucket --delete

# 3. Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

## File Structure After Build

```
build/
├── index.html          # Processed template with static paths
├── static/
│   ├── css/
│   │   └── pedigree.css
│   └── js/
│       ├── fhh_build_pedigree.js
│       ├── fhh_display_pedigree.js
│       ├── fhh_load.js
│       └── fhh_move.js
└── config/
    └── lfss.json
```

## Template Processing

The build script replaces Flask template syntax with static paths:

- `{{ url_for('static', filename='css/pedigree.css') }}` → `./static/css/pedigree.css`
- `{{ url_for('static', filename='js/file.js') }}` → `./static/js/file.js`

## JavaScript API Integration

### Key Functions

- **`initializeApiConfig(config)`**: Configures API base URL from loaded config
- **`buildApiUrl(endpoint)`**: Constructs full API URLs or returns relative paths
- **`check_for_files()`**: Loads family list from `/families` endpoint
- **`load_config_and_data(family_id)`**: Loads family data and annotations
- **`save_positions_and_annotations(data)`**: Saves annotation data via API

### Example Usage

```javascript
// Automatically configured based on config.json
await check_for_files(); // Calls buildApiUrl("/families")
const [data, annotations, config] = await load_config_and_data("family_123");
```

## Environment Configuration

### Local Development

- Leave `api.baseUrl` empty in `config/lfss.json`
- Uses relative paths to Flask server
- All routes work locally

### Production

- `api.baseUrl` automatically injected during build
- Uses full API Gateway URLs
- CORS configured for frontend domain

## CloudFront Configuration

The CloudFront distribution serves:

- **Root**: `index.html` as default object
- **Static Assets**: From `static/` directory with caching
- **API Config**: Dynamic configuration from `config/` directory
- **Error Handling**: 404/403 redirect to `index.html` for SPA behavior

## Troubleshooting

### API Gateway Issues

1. Check `config/lfss.json` has correct `api.baseUrl`
2. Verify CORS configuration on API Gateway
3. Ensure API Gateway is deployed before frontend

### Build Issues

1. Verify Python 3 is available
2. Check file permissions in build directory
3. Validate JSON syntax in config files

### Development vs Production

- **Local**: Uses Flask routes with relative paths
- **Production**: Uses API Gateway with full URLs
- **Config**: Automatically switches based on `api.baseUrl` presence
