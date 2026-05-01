/**
 * API Gatekeeper API Types
 *
 * Shapes mirror the Python api_gatekeeper_models library on the backend.
 */

/** HTTP methods a Route can define auth requirements for. */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'DELETE'
  | 'PATCH'
  | 'HEAD'
  | 'OPTIONS';

/** Authentication type required for a method on a route. */
export type AuthType = 'api_key' | 'hmac';

/** Auth requirement for a single HTTP method on a route. */
export interface MethodAuth {
  auth_required: boolean;
  /** Present only when auth_required is true. */
  auth_type: AuthType | null;
}

/** A protected route entry. */
export interface Route {
  route_id: string;
  route_pattern: string;
  domain: string;
  service_name: string;
  methods: Partial<Record<HttpMethod, MethodAuth>>;
  created_at: number;
  updated_at: number;
}

/** Lifecycle state of a Client credential. */
export type ClientStatus = 'active' | 'suspended' | 'revoked';

/**
 * A Client (credential) as returned by the admin list endpoint.
 *
 * The list endpoint returns a redacted projection: shared_secret is never
 * exposed, and api_key is masked to `prefix…suffix` form for identification.
 * If you need the raw api_key/shared_secret, those are returned only at
 * creation/rotation time via dedicated endpoints (not modeled here yet).
 */
export interface ClientSummary {
  client_id: string;
  client_name: string;
  status: ClientStatus;
  /** Masked form: e.g. `ak_full_…2345`. Identifies the credential without exposing it. */
  api_key_masked: string;
  created_at: number;
  updated_at: number;
}

/** Error envelope returned by the Gatekeeper API. */
export interface ApiError {
  /** HTTP status code. */
  code: number;
  /** Status token such as "error" / "unauthorized" — may be absent. */
  status?: string;
  /** Human-readable message. */
  message?: string;
  /** Short error key. */
  error?: string;
}

/** Configuration for the GatekeeperClient. */
export interface GatekeeperClientConfig {
  /** Base URL of the Gatekeeper instance, e.g. "https://gatekeeper.example.com". */
  baseUrl: string;
  /**
   * Aegis-issued bearer token. The Gatekeeper backend calls Aegis's
   * /api/auth/me to resolve it and checks console_admins membership.
   */
  token?: string;
  /** Request timeout in milliseconds. Defaults to 30000. */
  timeout?: number;
}
