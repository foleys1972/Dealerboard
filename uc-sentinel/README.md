# UC Sentinel

## Local dev

1. Create DB and apply schema in `schema.sql`
2. Create `.env` from `.env.example`
3. Install deps:

```bash
npm install
```

4. Run:

```bash
npm run dev
```

## Auth

All endpoints (except `/api/v1/health`) require:

`Authorization: Bearer <token>`

Tokens live in `sentinel_subscriber_tokens`.
