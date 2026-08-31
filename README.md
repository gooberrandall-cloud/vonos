# vonos

Next.js frontend for the Vonos multi-tenant platform.

## Vercel

Import this repo and set **Root Directory** to `apps/web`.

Env: `NEXT_PUBLIC_API_URL` (backend URL), `NEXT_PUBLIC_SKIP_AUTH=false`

## Local

```bash
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > apps/web/.env.local
npm run dev
```
