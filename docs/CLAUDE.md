# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a HubSpot CSV integration that provides two deployment modes:
1. **Standalone CLI** - Direct Node.js script execution
2. **Dockerized HTTP API** - Containerized web service for automation

The integration processes CSV files to create/update HubSpot contacts and companies, automatically associating contacts with their respective companies based on company names.

## Core Architecture

The codebase follows a modular architecture with three main processing components:

### Processing Pipeline
1. **CSVProcessor** (`csv-processor.js`) - Parses CSV data and maps flexible column names to HubSpot properties
2. **HubSpotClient** (`hubspot-client.js`) - Handles all HubSpot API interactions (search, create, update, associate)
3. **HubSpotIntegration** (`integration.js`) - Orchestrates the entire process and manages statistics

### Data Flow
- CSV data is parsed and validated
- Contacts are grouped by their associated companies
- Companies are processed first (create/update based on name)
- Contacts are processed second (create/update based on email)
- Contacts are automatically associated with their companies
- Processing statistics are collected and reported

## Key Commands

### Development and Testing
```bash
# Install dependencies
npm install

# Test with sample data
npm test

# Run standalone integration
npm run standalone path/to/file.csv

# Start HTTP API server
npm start
# or
npm run dev
```

### Docker Operations
```bash
# Build and run containerized API
docker-compose up --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Build image manually
docker build -t hubspot-csv-integration .
```

### HubSpot CLI (Legacy - for reference)
```bash
# Authenticate HubSpot CLI
hs auth

# Deploy HubSpot app
hs project deploy

# Local HubSpot development
hs project dev
```

## Environment Configuration

### Required Environment Variables
- `HUBSPOT_ACCESS_TOKEN` - HubSpot private app access token
- `HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID` - Custom object type ID (format: `2-123456`)

### Setup Process
1. Create `.env` file from `.env.example`
2. Create HubSpot private app with required scopes:
   - `crm.objects.contacts.read/write`
   - `crm.objects.companies.read/write`
3. Get access token and accounts object type ID
4. Update `.env` with actual values

## CSV Data Mapping

The system processes CSV files with the following exact field mapping specification:

### CSV to Accounts Custom Object
| CSV Field | HubSpot Accounts Property | Type | Notes |
|-----------|---------------------------|------|-------|
| `user_id` | `id` | string | **Primary key** |
| `user_type` | `account_type` | single select | **MP→MP, WIX→USAMPS** |
| `active_sub` | `active_subscription` | boolean | Subscription status |
| `weekly_sub_count` | `weekly_subscriptions` | number | Weekly subscription count |
| `monthly_sub_count` | `monthly_subscriptions` | number | Monthly subscription count |
| `daily_sub_count` | `daily_subscriptions` | number | Daily subscription count |

**Ignored CSV Fields for Accounts**: `email`, `total_sub_count`, `_id`

### CSV to Contacts Object  
| CSV Field | HubSpot Contact Property | Type | Notes |
|-----------|--------------------------|------|-------|
| `email` | `email` | string | **Primary key** |
| `user_type` | `user_type` | multiselect | **Same options as account_type, can add to but don't overwrite existing** |

**Ignored CSV Fields for Contacts**: Names are ignored

### Integration Workflow
1. **Update existing Accounts** (by `user_id`) → **overwrite all subscription values**
2. **Create new Accounts** if they don't exist  
3. **If new account created** → search for Contact by `email`
4. **If Contact exists** → associate with new Account
5. **If Contact doesn't exist** → create Contact + associate with new Account

### Account Type Mapping
- **MP** → **MP**
- **WIX** → **USAMPS**

## API Endpoints (HTTP Mode)

- `GET /health` - Health check
- `GET /api/docs` - API documentation
- `POST /api/process-csv` - Process CSV data (JSON body)
- `POST /api/upload-csv` - Upload CSV file (multipart)

## File Structure Context

- **Root level**: Standalone integration files and Docker configuration
- **src/app/**: Legacy HubSpot app platform files (reference only)
- **server.js**: Express.js HTTP API wrapper
- **standalone-integration.js**: CLI version with direct file processing
- **sample-data.csv**: Test data for development

## Integration Modes

### Standalone Mode
Use for direct CSV file processing or cron jobs:
```bash
node standalone-integration.js data.csv
```

### API Mode
Use for web automation, webhooks, or external integrations:
```bash
docker-compose up -d
curl -X POST http://localhost:3000/api/process-csv -d '{"csvData": "..."}'
```

## Error Handling Strategy

The integration includes comprehensive error handling:
- Email validation for contacts
- Required field validation
- HubSpot API error management
- Detailed error statistics and logging
- Graceful degradation (continues processing on individual record errors)

## Deployment Considerations

- **Docker**: Production-ready with health checks and proper security
- **Cloud platforms**: Ready for AWS ECS, Google Cloud Run, Azure Container Instances
- **Scaling**: Stateless design allows horizontal scaling
- **Monitoring**: Health endpoints and structured logging for observability

## Documentation for Context

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.