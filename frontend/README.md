# Frontend Build Process

## Build Process

### Local Development

To run the Flask application locally for development:

```bash
python web.py
```

### Building for Deployment

To build static assets for deployment:

```bash
python build.py
```

This script:

1. Creates a `build/` directory
2. Copies all static files (CSS, JS) to `build/static/`
3. Copies config files to `build/config/`
4. Processes HTML templates, replacing Jinja2 `url_for()` calls with actual static paths
5. Outputs processed templates directly in the `build/` directory

### Deployment

The deployment process now uses the `build/` directory as the source:

#### Using CDK

```bash
cd infrastructure
export TIER=dev  # or prod
export AWS_ACCOUNT_ID=your-account-id
./deploy-lambda.sh
```

#### Using GitHub Actions

The workflow automatically builds assets before deployment.

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
    └── basic.json
```

## Template Processing

The build script replaces:

- `{{ url_for('static', filename='css/pedigree.css') }}` → `./static/css/pedigree.css`
- `{{ url_for('static', filename='js/file.js') }}` → `./static/js/file.js`

## CloudFront Configuration

The CloudFront distribution is configured to:

- Serve `index.html` as the default root object
- Handle 404/403 errors by serving `index.html`
- Serve static assets from the `static/` directory
