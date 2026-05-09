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
  PermissionSummary,
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
}
