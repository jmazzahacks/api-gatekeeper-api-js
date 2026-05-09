/**
 * API Gatekeeper API Client
 *
 * TypeScript client for the API Gatekeeper admin HTTP API.
 *
 * @example
 * ```typescript
 * import { GatekeeperClient } from '@jmazzahacks/api-gatekeeper-api';
 *
 * const client = new GatekeeperClient({
 *   baseUrl: 'https://gatekeeper.example.com',
 *   token: aegisBearerToken,
 * });
 *
 * const routes = await client.listRoutes();
 * ```
 */

export { GatekeeperClient, GatekeeperApiError } from './client.js';

export type {
  ApiError,
  AuthType,
  ClientStatus,
  ClientSummary,
  GatekeeperClientConfig,
  HttpMethod,
  MethodAuth,
  PermissionSummary,
  Route,
  RoutePayload,
} from './types.js';
