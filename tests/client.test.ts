/**
 * Unit tests for GatekeeperClient.
 *
 * Mocks global `fetch` so tests don't hit a real Gatekeeper instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GatekeeperApiError, GatekeeperClient } from '../src/client.js';
import type {
  ClientCreated,
  ClientCreatePayload,
  ClientSummary,
  ClientUpdatePayload,
  PermissionSummary,
  Route,
  RoutePayload,
} from '../src/types.js';

type FetchMock = ReturnType<typeof vi.fn>;

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SAMPLE_ROUTE: Route = {
  route_id: 'abc-123',
  route_pattern: '/api/users/*',
  domain: '*',
  service_name: 'user-svc',
  methods: {
    GET: { auth_required: true, auth_type: 'api_key' },
    POST: { auth_required: true, auth_type: 'hmac' },
  },
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
};

const SAMPLE_CLIENT: ClientSummary = {
  client_id: 'client-uuid-1',
  client_name: 'alpha-service',
  status: 'active',
  api_key_masked: 'ak_alpha…0001',
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
};

const SAMPLE_PERMISSION: PermissionSummary = {
  permission_id: 'perm-uuid-1',
  client_id: 'client-uuid-1',
  client_name: 'alpha-service',
  route_id: 'abc-123',
  route_domain: 'api.example.com',
  route_pattern: '/api/users/*',
  route_service_name: 'user-svc',
  allowed_methods: ['GET', 'POST'],
  created_at: 1_700_000_000,
};

describe('GatekeeperClient configuration', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(mockJsonResponse([]));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips a trailing slash from baseUrl', async () => {
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com/' });

    await client.listRoutes();

    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toBe('https://gatekeeper.example.com/api/admin/routes');
  });

  it('omits Authorization header when no token is configured', async () => {
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.listRoutes();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('sends Bearer Authorization header when a token is configured', async () => {
    const client = new GatekeeperClient({
      baseUrl: 'https://gatekeeper.example.com',
      token: 'tok_abc',
    });

    await client.listRoutes();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok_abc');
  });

  it('setToken replaces the bearer used on subsequent calls', async () => {
    const client = new GatekeeperClient({
      baseUrl: 'https://gatekeeper.example.com',
      token: 'tok_old',
    });

    client.setToken('tok_new');
    await client.listRoutes();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok_new');
  });

  it('setToken(undefined) clears the bearer', async () => {
    const client = new GatekeeperClient({
      baseUrl: 'https://gatekeeper.example.com',
      token: 'tok_old',
    });

    client.setToken(undefined);
    await client.listRoutes();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('GatekeeperClient.listRoutes', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls GET /api/admin/routes', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.listRoutes();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/routes');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('returns the parsed array of routes', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([SAMPLE_ROUTE]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const routes = await client.listRoutes();

    expect(routes).toHaveLength(1);
    expect(routes[0].route_pattern).toBe('/api/users/*');
    expect(routes[0].methods.POST?.auth_type).toBe('hmac');
  });

  it('returns an empty array when none are configured', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const routes = await client.listRoutes();

    expect(routes).toEqual([]);
  });

  it('throws GatekeeperApiError on 401', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.listRoutes()).rejects.toBeInstanceOf(GatekeeperApiError);

    try {
      await client.listRoutes();
    } catch (err) {
      expect(err).toBeInstanceOf(GatekeeperApiError);
      expect((err as GatekeeperApiError).code).toBe(401);
    }
  });

  it('throws GatekeeperApiError on 503 even when body is not JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response('Service Unavailable', { status: 503 }),
    );
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.listRoutes()).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 503,
    });
  });
});

describe('GatekeeperClient.listClients', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls GET /api/admin/clients', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.listClients();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/clients');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('returns the parsed array of client summaries', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([SAMPLE_CLIENT]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const clients = await client.listClients();

    expect(clients).toHaveLength(1);
    expect(clients[0].client_name).toBe('alpha-service');
    expect(clients[0].status).toBe('active');
    expect(clients[0].api_key_masked).toBe('ak_alpha…0001');
  });

  it('returns an empty array when none are configured', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const clients = await client.listClients();

    expect(clients).toEqual([]);
  });

  it('throws GatekeeperApiError on 401', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.listClients()).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 401,
    });
  });
});

describe('GatekeeperClient.listPermissions', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls GET /api/admin/permissions', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.listPermissions();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/permissions');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('returns the parsed array of permission summaries', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([SAMPLE_PERMISSION]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const permissions = await client.listPermissions();

    expect(permissions).toHaveLength(1);
    expect(permissions[0].client_name).toBe('alpha-service');
    expect(permissions[0].route_pattern).toBe('/api/users/*');
    expect(permissions[0].allowed_methods).toEqual(['GET', 'POST']);
  });

  it('returns an empty array when none are configured', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse([]));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const permissions = await client.listPermissions();

    expect(permissions).toEqual([]);
  });

  it('throws GatekeeperApiError on 401', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'Unauthorized' }, 401));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.listPermissions()).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 401,
    });
  });
});

describe('GatekeeperClient.createRoute', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const PAYLOAD: RoutePayload = {
    route_pattern: '/api/widgets',
    domain: 'api.example.com',
    service_name: 'widget-svc',
    methods: {
      GET: { auth_required: false, auth_type: null },
      POST: { auth_required: true, auth_type: 'api_key' },
    },
  };

  it('POSTs to /api/admin/routes with the payload as JSON body', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(SAMPLE_ROUTE, 201));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com', token: 't' });

    await client.createRoute(PAYLOAD);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/routes');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(PAYLOAD);
  });

  it('returns the parsed Route on 201', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(SAMPLE_ROUTE, 201));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const route = await client.createRoute(PAYLOAD);

    expect(route.route_id).toBe('abc-123');
  });

  it('throws GatekeeperApiError on 400', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'invalid_request' }, 400));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.createRoute(PAYLOAD)).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 400,
    });
  });
});

describe('GatekeeperClient.updateRoute', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const PAYLOAD: RoutePayload = {
    route_pattern: '/api/users/*',
    domain: '*',
    service_name: 'user-svc',
    methods: { GET: { auth_required: true, auth_type: 'api_key' } },
  };

  it('PUTs to /api/admin/routes/<id>', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(SAMPLE_ROUTE));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.updateRoute('abc-123', PAYLOAD);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/routes/abc-123');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('url-encodes the route id', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(SAMPLE_ROUTE));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.updateRoute('weird id/with slash', PAYLOAD);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://gatekeeper.example.com/api/admin/routes/weird%20id%2Fwith%20slash',
    );
  });

  it('throws GatekeeperApiError on 404', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'not_found' }, 404));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.updateRoute('missing', PAYLOAD)).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 404,
    });
  });
});

describe('GatekeeperClient.deleteRoute', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETEs /api/admin/routes/<id>', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.deleteRoute('abc-123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/routes/abc-123');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('resolves on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.deleteRoute('abc-123')).resolves.toBeUndefined();
  });

  it('throws GatekeeperApiError on 404', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'not_found' }, 404));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.deleteRoute('missing')).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 404,
    });
  });
});

describe('GatekeeperClient.createClient', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const PAYLOAD: ClientCreatePayload = {
    client_name: 'mobile-app',
    api_key: { generate: true },
    shared_secret: null,
  };

  const CREATED: ClientCreated = {
    client_id: 'cuid-1',
    client_name: 'mobile-app',
    api_key: 'ak_raw_value_aaaaaaaaaaaaaaaaaaaaaa',
    shared_secret: null,
    status: 'active',
    created_at: 1_700_000_000,
    updated_at: 1_700_000_000,
  };

  it('POSTs to /api/admin/clients with the payload as JSON body', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(CREATED, 201));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com', token: 't' });

    await client.createClient(PAYLOAD);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/clients');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual(PAYLOAD);
  });

  it('returns the parsed Client with the raw api_key on 201', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(CREATED, 201));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const created = await client.createClient(PAYLOAD);

    expect(created.client_id).toBe('cuid-1');
    expect(created.api_key).toBe('ak_raw_value_aaaaaaaaaaaaaaaaaaaaaa');
    expect(created.shared_secret).toBeNull();
  });

  it('throws GatekeeperApiError on 400 (validation failure)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'invalid_request' }, 400));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.createClient(PAYLOAD)).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 400,
    });
  });
});

describe('GatekeeperClient.updateClient', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const PAYLOAD: ClientUpdatePayload = {
    client_name: 'renamed',
    status: 'suspended',
  };

  const SUMMARY: ClientSummary = {
    client_id: 'cuid-1',
    client_name: 'renamed',
    status: 'suspended',
    api_key_masked: 'ak_raw_…aaaa',
    created_at: 1_700_000_000,
    updated_at: 1_700_001_000,
  };

  it('PUTs to /api/admin/clients/<id>', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(SUMMARY));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.updateClient('cuid-1', PAYLOAD);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/clients/cuid-1');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('url-encodes the client id', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(SUMMARY));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.updateClient('weird id/with slash', PAYLOAD);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://gatekeeper.example.com/api/admin/clients/weird%20id%2Fwith%20slash',
    );
  });

  it('returns the redacted ClientSummary (no raw secrets)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse(SUMMARY));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    const summary = await client.updateClient('cuid-1', PAYLOAD);

    expect(summary.api_key_masked).toBe('ak_raw_…aaaa');
    // ClientSummary type has no api_key/shared_secret fields, but verify the
    // wire shape doesn't accidentally pass them through.
    expect((summary as unknown as Record<string, unknown>).api_key).toBeUndefined();
    expect((summary as unknown as Record<string, unknown>).shared_secret).toBeUndefined();
  });

  it('throws GatekeeperApiError on 404', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'not_found' }, 404));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.updateClient('missing', PAYLOAD)).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 404,
    });
  });
});

describe('GatekeeperClient.deleteClient', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    vi.stubGlobal('fetch', (fetchMock = vi.fn()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('DELETEs /api/admin/clients/<id>', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await client.deleteClient('cuid-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gatekeeper.example.com/api/admin/clients/cuid-1');
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('resolves on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.deleteClient('cuid-1')).resolves.toBeUndefined();
  });

  it('throws GatekeeperApiError on 404', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ error: 'not_found' }, 404));
    const client = new GatekeeperClient({ baseUrl: 'https://gatekeeper.example.com' });

    await expect(client.deleteClient('missing')).rejects.toMatchObject({
      name: 'GatekeeperApiError',
      code: 404,
    });
  });
});
