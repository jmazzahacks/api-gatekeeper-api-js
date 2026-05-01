/**
 * Unit tests for GatekeeperClient.
 *
 * Mocks global `fetch` so tests don't hit a real Gatekeeper instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GatekeeperApiError, GatekeeperClient } from '../src/client.js';
import type { ClientSummary, Route } from '../src/types.js';

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
