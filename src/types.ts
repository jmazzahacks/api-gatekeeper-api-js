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
