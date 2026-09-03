import type { PolicyName } from "./policy";

/**
 * Worked examples for the console.
 *
 * The first three are the scenarios from the brief; the rest exist to make
 * failure handling reproducible, because a demo that only ever succeeds proves
 * nothing about a system whose entire purpose is surviving failure.
 *
 * Labels live in the dictionary, not here: this module is request data.
 */
export interface Preset {
  id: string;
  source: string;
  event_type: string;
  method: string;
  /**
   * A path into the bundled mock vendor, or an absolute URL. `{KEY}` is
   * replaced with a fresh value each time the preset is applied, so re-running
   * "fails twice then succeeds" actually fails twice again instead of hitting
   * a counter left over from the last run.
   */
  url: string;
  headers: Record<string, string>;
  body: unknown;
  policy: PolicyName;
}

export const PRESETS: Preset[] = [
  {
    id: "ads",
    source: "signup-service",
    event_type: "user.registered",
    method: "POST",
    url: "/api/mock/vendor?mode=ok&key={KEY}",
    headers: { "Content-Type": "application/json", "X-Api-Key": "ad-network-demo-key" },
    body: { click_id: "gclid_8823a", event: "signup", value: 0 },
    policy: "standard",
  },
  {
    id: "crm",
    source: "billing-service",
    event_type: "subscription.paid",
    method: "PUT",
    url: "/api/mock/vendor?mode=ok&key={KEY}",
    headers: { "Content-Type": "application/json", Authorization: "Bearer crm-demo-token" },
    body: { contact_id: "c_99120", status: "active", plan: "pro_annual" },
    policy: "patient",
  },
  {
    id: "inventory",
    source: "order-service",
    event_type: "order.placed",
    method: "POST",
    url: "/api/mock/vendor?mode=flaky&fail_times=2&status=503&key={KEY}",
    headers: { "Content-Type": "application/json" },
    body: { sku: "TS-BLK-M", delta: -1, order_id: "o_55021" },
    policy: "standard",
  },
  {
    id: "outage",
    source: "order-service",
    event_type: "order.placed",
    method: "POST",
    url: "/api/mock/vendor?mode=fail&status=500&key={KEY}",
    headers: { "Content-Type": "application/json" },
    body: { sku: "MG-WHT-1", delta: -2, order_id: "o_54888" },
    policy: "fast",
  },
  {
    id: "badrequest",
    source: "billing-service",
    event_type: "subscription.paid",
    method: "POST",
    url: "/api/mock/vendor?mode=fail&status=400&key={KEY}",
    headers: { "Content-Type": "application/json" },
    body: { contact_id: null, status: "active" },
    policy: "standard",
  },
  {
    id: "ratelimit",
    source: "signup-service",
    event_type: "user.registered",
    method: "POST",
    url: "/api/mock/vendor?mode=ratelimit&fail_times=1&retry_after=5&key={KEY}",
    headers: { "Content-Type": "application/json" },
    body: { click_id: "gclid_7710b", event: "signup" },
    policy: "standard",
  },
  {
    id: "timeout",
    source: "order-service",
    event_type: "order.placed",
    method: "POST",
    url: "/api/mock/vendor?mode=slow&delay_ms=8000&key={KEY}",
    headers: { "Content-Type": "application/json" },
    body: { sku: "SL-OW-1", delta: -1 },
    policy: "fast",
  },
  {
    id: "ssrf",
    source: "signup-service",
    event_type: "user.registered",
    method: "POST",
    url: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    headers: { "Content-Type": "application/json" },
    body: { click_id: "gclid_evil" },
    policy: "standard",
  },
];

/** Applies a preset to a concrete origin, with a fresh mock-vendor key. */
export function resolvePresetUrl(url: string, origin: string): string {
  const withKey = url.replace("{KEY}", Math.random().toString(36).slice(2, 10));
  return withKey.startsWith("/") ? `${origin}${withKey}` : withKey;
}
