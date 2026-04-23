# Contributing to RoboViz

## Development Environment Setup

### Prerequisites
- Node.js 20+
- Python 3.11+
- Docker and Docker Compose
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/roboviz.git
   cd roboviz
   ```

2. **Install JavaScript dependencies**
   ```bash
   npm install
   ```

3. **Set up Python environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r agents/python-agent/requirements.txt
   ```

4. **Start infrastructure**
   ```bash
   docker compose up -d postgres minio createbucket
   ```

5. **Copy environment files**
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```

6. **Initialize the database**
   ```bash
   npm --workspace @roboviz/api run db:init
   ```

## Development Workflow

### Running Services Locally

**Terminal 1: API**
```bash
npm run dev:api
```

**Terminal 2: Web**
```bash
npm run dev:web
```

**Terminal 3: Simulated Robot**
```bash
python agents/python-agent/agent.py \
  --robot-id robot-sim-01 \
  --name "Dev Scout" \
  --location test-lab
```

### Building for Production

```bash
npm run build
```

### Linting and Formatting

```bash
# Check code style
npm run lint

# Fix formatting
npx prettier --write "apps/**/*.{ts,tsx}"
```

## Code Standards

- **TypeScript**: Strict mode enabled, no `any` types without justification
- **Python**: Follow PEP 8, use type hints
- **Formatting**: 2-space indentation, Prettier configured
- **Testing**: Add tests for new features
- **Documentation**: Update API docs and README for changes

## Testing

### JavaScript Tests
```bash
npm run test
```

### Python Tests
```bash
python -m pytest agents/python-agent/
```

### Integration Tests
```bash
docker compose up -d
npm run test:integration
```

## Commit Guidelines

- Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
- Keep commits atomic and well-scoped
- Reference issues: `closes #123`

## Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with clear messages
4. Push to your fork
5. Open a Pull Request with a description
6. Ensure CI passes
7. Request review from maintainers

## Project Structure

```
roboviz/
├── apps/
│   ├── api/              # Node.js API server
│   └── web/              # React dashboard
├── agents/
│   └── python-agent/     # On-device sensor collector
├── docs/                 # Documentation
├── docker-compose.yml    # Local dev infrastructure
└── package.json          # Workspace configuration
```

## Common Tasks

### Adding a New Sensor Type

1. Update `apps/api/src/types.ts` with the new sensor type
2. Add schema validation in the same file
3. Update the Python agent in `agents/python-agent/agent.py`
4. Add payload generation method
5. Update frontend types in `apps/web/src/types.ts`
6. Add visualization component if needed in `apps/web/src/`
7. Update API documentation in `API.md`

### Adding a New API Endpoint

1. Add route in `apps/api/src/routes.ts`
2. Add type definitions in `apps/api/src/types.ts`
3. Implement database queries if needed in `apps/api/src/db.ts`
4. Update API documentation in `API.md`
5. Add tests

### Extending the Frontend

1. Create component in `apps/web/src/`
2. Update types in `apps/web/src/types.ts`
3. Import and use in `apps/web/src/App.tsx`
4. Style with `apps/web/src/styles.css` (CSS modules encouraged for new components)

## Debugging

### API Debugging
```bash
# With detailed logging
DEBUG=roboviz:* npm run dev:api
```

### Frontend Debugging
- Use Chrome DevTools
- Check browser console for network errors
- Use React DevTools extension

### Database Debugging
```bash
# Connect to PostgreSQL
psql -U postgres -d roboviz -h localhost
```

### Python Agent Debugging
```bash
# Enable verbose output
python -u agents/python-agent/agent.py --robot-id debug-01
```

## Performance Considerations

- Batch sensor events before transmission (default 250 events/batch)
- Use appropriate compression (gzip for archive storage)
- Index frequently queried fields
- Implement pagination for large result sets
- Cache static assets and API responses where applicable

## Security Checklist

- Validate all input in API endpoints
- Sanitize database queries
- Use prepared statements
- Implement rate limiting for production
- Add authentication/authorization layer
- Rotate secrets regularly
- Audit dependencies for vulnerabilities

## Questions?

- Open an issue for bugs or feature requests
- Start a discussion for architectural questions
- Check existing issues and PRs first
