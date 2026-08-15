/**
 * Every route in the API, in one list.
 *
 * The order does not matter — `Router.match` scores literal segments above
 * parameters, so `/v1/partner/venues` and `/v1/venues/:id` cannot shadow each
 * other however these are arranged. Keeping them in one exported array means the
 * index endpoint below can list the whole surface, which is the cheapest
 * possible smoke test: if a route is missing from `/v1`, it does not exist.
 */
import type { Route } from '../router.ts';
import { adminRoutes } from './admin.ts';
import { authRoutes } from './auth.ts';
import { billingRoutes } from './billing.ts';
import { consumerRoutes } from './consumer.ts';
import { gateRoutes } from './gate.ts';
import { guidanceRoutes } from './guidance.ts';
import { partnerRoutes } from './partner.ts';

export const allRoutes: Route[] = [
  ...authRoutes,
  ...consumerRoutes,
  ...gateRoutes,
  ...partnerRoutes,
  ...adminRoutes,
  ...billingRoutes,
  ...guidanceRoutes,
];
