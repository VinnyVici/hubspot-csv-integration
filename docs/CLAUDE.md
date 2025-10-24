# CLAUDE.md - Development Context

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

HubSpot CSV integration with enterprise-grade performance optimization:
1. **CLI Mode** - Direct Node.js script execution (`src/cli/cli.js`)
2. **HTTP API** - Containerized web service (`src/api/server.js`)
3. **Docker** - Production containerization (`docker/`)

Processes CSV files to create/update HubSpot Accounts and Contacts with automatic associations.

## Core Architecture

### Processing Pipeline
1. **Processor** (`src/core/processor.js`) - CSV parsing, data validation, batch grouping
2. **OAuth Client** (`src/core/oauth-client.js`) - HubSpot API interactions (CRUD, search, associate)
3. **Integration** (`src/core/integration.js`) - Orchestrates workflow and statistics

### Data Flow
- CSV data parsed and validated
- Records categorized (create vs update) via existence checking
- Batch processing: Accounts → Contacts → Associations
- Smart filtering: Only processes active subscriptions + status changes
- Real-time statistics and error handling

## Key Commands

```bash
# Development
npm install
npm test
npm run process-csv data.csv

# Production
npm start                    # HTTP API
cd docker && docker-compose up -d   # Docker deployment
```

## Deployment Reference
**Complete setup guide:** See [DEPLOYMENT.md](../DEPLOYMENT.md) for step-by-step HubSpot configuration.

## Environment Configuration

**Required Variables:**
- `HUBSPOT_ACCESS_TOKEN` - HubSpot private app token  
- `HUBSPOT_ACCOUNTS_OBJECT_TYPE_ID` - Custom object ID (format: `2-123456`)

**Setup:** See [DEPLOYMENT.md](../DEPLOYMENT.md) for complete HubSpot private app configuration.

## CSV Data Processing

**Account Creation (Primary: `user_id`):**
- `user_type`: MP→MP, WIX→USAMPS  
- `active_sub` → `active_subscription` (boolean)
- Subscription counts → number fields
- Ignored: `email`, `total_sub_count`, `_id`

**Contact Creation (Primary: `email`):**
- `user_type`: Mapped same as accounts (multiselect)
- Automatic association with matching Account

**Workflow:**
1. Update existing Accounts (by `user_id`)
2. Create new Accounts if needed
3. Search/create Contacts (by `email`)  
4. Associate Contacts with Accounts

## API Endpoints

- `GET /health` - Health check
- `GET /api/docs` - API documentation  
- `POST /api/process-csv` - Process CSV data
- `POST /api/upload-csv` - Upload CSV file

## File Structure

```
src/core/     # Integration logic
src/api/      # HTTP server  
src/cli/      # Command line
docker/       # Containerization
tests/        # Test suite
```

## Technical Notes

- **Error Handling**: Graceful degradation, continues on individual failures
- **Performance**: Smart filtering, batch operations, rate limiting
- **Deployment**: Docker-ready, stateless, horizontally scalable
- **Monitoring**: Health endpoints, structured logging

## Development Context

**Use Context7 MCP tools** for HubSpot API documentation and code generation assistance.