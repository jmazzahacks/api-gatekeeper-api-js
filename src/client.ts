/**
 * API Gatekeeper API Client
 */

import type {
  ApiError,
  ClientCreated,
  ClientCreatePayload,
  ClientSummary,
  ClientUpdatePayload,
  GatekeeperClientConfig,
  PermissionCreatePayload,
  PermissionSummary,
  PermissionUpdatePayload,
  RateLimitPayload,
  RateLimitSummary,
  Route,
  RoutePayload,
} from './types.js';

export class GatekeeperApiError extends Error {
  public readonly code: number;
  public readonly status: string;

  constructor(error: ApiError) {
    super(error.message || error.error || 'Unknown API error');
    this.name = 'GatekeeperApiError';
    this.code = error.code;
    this.status = error.status || 'error';
  }
}

export class GatekeeperClient {
  private readonly baseUrl: string;
  private token: string | undefined;
  private readonly timeout: number;

  constructor(config: GatekeeperClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.token = config.token;
    this.timeout = config.timeout ?? 30000;
  }

  /** Replace the bearer token used for authenticated requests. */
  setToken(token: string | undefined): void {
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: unknown,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorData: Partial<ApiError> = {};
        try {
          errorData = await response.json();
        } catch {
          // Response body wasn't JSON — fall through with an empty envelope.
        }
        throw new GatekeeperApiError({
          code: response.status,
          status: errorData.status,
          message: errorData.message,
          error: errorData.error,
        });
      }

      // 204 No Content — nothing to parse
      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof GatekeeperApiError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * List all configured routes on the Gatekeeper instance.
   * Requires a valid bearer token from a provisioned console admin.
   */
  async listRoutes(): Promise<Route[]> {
    return this.request<Route[]>('GET', '/api/admin/routes');
  }

  /**
   * Create a new route. Returns the persisted Route with its generated id.
   */
  async createRoute(payload: RoutePayload): Promise<Route> {
    return this.request<Route>('POST', '/api/admin/routes', undefined, payload);
  }

  /**
   * Replace the configuration of an existing route. Returns the updated Route.
   * Throws GatekeeperApiError(404) if the route_id is unknown.
   */
  async updateRoute(routeId: string, payload: RoutePayload): Promise<Route> {
    return this.request<Route>('PUT', `/api/admin/routes/${encodeURIComponent(routeId)}`, undefined, payload);
  }

  /**
   * Delete a route by id. Resolves on 204 success.
   * Throws GatekeeperApiError(404) if the route_id is unknown.
   */
  async deleteRoute(routeId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/admin/routes/${encodeURIComponent(routeId)}`);
  }

  /**
   * List all configured clients (credentials) on the Gatekeeper instance.
   * Requires a valid bearer token from a provisioned console admin.
   *
   * The response is redacted — shared_secret is never returned, and api_key
   * is masked. See ClientSummary.
   */
  async listClients(): Promise<ClientSummary[]> {
    return this.request<ClientSummary[]>('GET', '/api/admin/clients');
  }

  /**
   * Create a new client. Returns the full Client record including raw
   * api_key and shared_secret — this is the ONLY response that exposes the
   * raw values. Surface them to the user immediately; subsequent listClients
   * calls return the redacted ClientSummary projection.
   */
  async createClient(payload: ClientCreatePayload): Promise<ClientCreated> {
    return this.request<ClientCreated>('POST', '/api/admin/clients', undefined, payload);
  }

  /**
   * Rename a client and/or change its status. Secrets are immutable here.
   * Returns the redacted ClientSummary. 404 if the client_id is unknown.
   */
  async updateClient(clientId: string, payload: ClientUpdatePayload): Promise<ClientSummary> {
    return this.request<ClientSummary>(
      'PUT',
      `/api/admin/clients/${encodeURIComponent(clientId)}`,
      undefined,
      payload,
    );
  }

  /**
   * Delete a client. Cascade-removes its permissions. Resolves on 204.
   * 404 if the client_id is unknown.
   */
  async deleteClient(clientId: string): Promise<void> {
    await this.request<void>('DELETE', `/api/admin/clients/${encodeURIComponent(clientId)}`);
  }

  /**
   * List all client→route permissions on the Gatekeeper instance.
   * Requires a valid bearer token from a provisioned console admin.
   *
   * Each row includes the joined display fields (client_name, route_*) so
   * the console can render rows directly. See PermissionSummary.
   */
  async listPermissions(): Promise<PermissionSummary[]> {
    return this.request<PermissionSummary[]>('GET', '/api/admin/permissions');
  }

  /**
   * Grant a client permission to access a route with specific HTTP methods.
   * Returns the persisted permission joined with display fields.
   * Throws GatekeeperApiError(409) if a permission for the same
   * (client_id, route_id) pair already exists.
   */
  async createPermission(payload: PermissionCreatePayload): Promise<PermissionSummary> {
    return this.request<PermissionSummary>('POST', '/api/admin/permissions', undefined, payload);
  }

  /**
   * Replace allowed_methods on an existing permission. client_id and
   * route_id are immutable here — to change those, deletePermission then
   * createPermission. Throws GatekeeperApiError(404) if unknown.
   */
  async updatePermission(
    permissionId: string,
    payload: PermissionUpdatePayload,
  ): Promise<PermissionSummary> {
    return this.request<PermissionSummary>(
      'PUT',
      `/api/admin/permissions/${encodeURIComponent(permissionId)}`,
      undefined,
      payload,
    );
  }

  /**
   * Revoke a permission. Resolves on 204.
   * Throws GatekeeperApiError(404) if the permission_id is unknown.
   */
  async deletePermission(permissionId: string): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/api/admin/permissions/${encodeURIComponent(permissionId)}`,
    );
  }

  /**
   * List per-client rate limits, joined with client_name. Clients without a
   * configured limit are absent from the response.
   */
  async listRateLimits(): Promise<RateLimitSummary[]> {
    return this.request<RateLimitSummary[]>('GET', '/api/admin/rate-limits');
  }

  /**
   * Upsert a rate limit for a client. First call to a client returns 201;
   * subsequent calls return 200 with the updated row. Throws
   * GatekeeperApiError(400) if the client_id is unknown.
   */
  async setRateLimit(clientId: string, payload: RateLimitPayload): Promise<RateLimitSummary> {
    return this.request<RateLimitSummary>(
      'PUT',
      `/api/admin/rate-limits/${encodeURIComponent(clientId)}`,
      undefined,
      payload,
    );
  }

  /**
   * Remove a client's per-client rate limit. Resolves on 204.
   * Throws GatekeeperApiError(404) if no limit was configured for the client.
   */
  async deleteRateLimit(clientId: string): Promise<void> {
    await this.request<void>(
      'DELETE',
      `/api/admin/rate-limits/${encodeURIComponent(clientId)}`,
    );
  }
}
