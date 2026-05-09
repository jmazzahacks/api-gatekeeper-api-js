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

/**
 * Payload accepted by createRoute / updateRoute.
 *
 * Same shape as Route minus the server-managed fields (route_id, created_at,
 * updated_at). At least one method must be provided.
 */
export interface RoutePayload {
  route_pattern: string;
  domain: string;
  service_name: string;
  methods: Partial<Record<HttpMethod, MethodAuth>>;
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

/**
 * One credential's request shape on createClient.
 *
 * - `null` — omit this credential type entirely
 * - `{ generate: true }` — server generates a strong random value
 * - `{ value: '<string>' }` — use a caller-supplied value (e.g. legacy migration)
 */
export type CredentialSpec =
  | null
  | { generate: true }
  | { value: string };

/** Body of POST /api/admin/clients. At least one of api_key/shared_secret must be non-null. */
export interface ClientCreatePayload {
  client_name: string;
  api_key: CredentialSpec;
  shared_secret: CredentialSpec;
  /** Defaults to "active" if omitted. */
  status?: ClientStatus;
}

/**
 * Response shape for createClient — the FULL Client record including raw
 * api_key and shared_secret (one-time exposure). Subsequent reads return the
 * redacted ClientSummary instead. Surface the raw secrets to the user
 * immediately and warn them they cannot be retrieved later.
 */
export interface ClientCreated {
  client_id: string;
  client_name: string;
  api_key: string | null;
  shared_secret: string | null;
  status: ClientStatus;
  created_at: number;
  updated_at: number;
}

/** Body of PUT /api/admin/clients/<id>. Secrets are immutable here. */
export interface ClientUpdatePayload {
  client_name: string;
  status: ClientStatus;
}

/**
 * A ClientPermission joined with display fields, as returned by the admin
 * list endpoint. The backend joins client_name and route domain/pattern/
 * service_name so the console can render a useful table without per-row
 * lookups.
 */
export interface PermissionSummary {
  permission_id: string;
  client_id: string;
  client_name: string;
  route_id: string;
  route_domain: string;
  route_pattern: string;
  route_service_name: string;
  allowed_methods: HttpMethod[];
  created_at: number;
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
