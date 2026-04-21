# api-gatekeeper-api

TypeScript API client for [API Gatekeeper](https://github.com/jmazzahacks/api-gatekeeper) —
an authentication/authorization service that sits behind nginx's
`ngx_http_auth_request_module` to gate API endpoints, validate HMAC signatures,
and enforce per-client rate limits.

This library is primarily consumed by the Gatekeeper admin console (a Next.js
frontend), but it's usable from any TypeScript codebase that needs to talk to
a Gatekeeper instance.

## Installation

Consume directly from GitHub in your `package.json`:

```json
{
  "dependencies": {
    "@jmazzahacks/api-gatekeeper-api": "github:jmazzahacks/api-gatekeeper-api-js"
  }
}
```

## Usage

```typescript
import { GatekeeperClient } from '@jmazzahacks/api-gatekeeper-api';

const client = new GatekeeperClient({
  baseUrl: 'https://gatekeeper.example.com',
  token: aegisBearerToken,  // Aegis-issued auth_token
});

const routes = await client.listRoutes();
console.log(routes);
```

Admin endpoints are gated by Aegis bearer-token authentication — the Gatekeeper
backend calls Aegis's `/api/auth/me` to resolve the token, then checks that the
user is provisioned in `console_admins`. A 401 is returned for any
authentication failure (no oracle between "bad token" and "not an admin").

## Development

```bash
npm install
npm run build      # emit dist/
npm test           # run vitest
```

## License

O'Saasy — see [LICENSE](./LICENSE). Free to use, modify, and redistribute;
not free to turn into a hosted SaaS competitor.
