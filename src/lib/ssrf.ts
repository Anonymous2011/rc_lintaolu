import dns from "node:dns/promises";
import net from "node:net";

/**
 * Target validation.
 *
 * The service takes a URL from a caller and makes an outbound request from
 * inside the network perimeter — textbook SSRF. Even for an internal service
 * this needs a guard, because "internal" means every business system that can
 * reach the ingress endpoint inherits our network position.
 *
 * Known limitation: we resolve the hostname here and `fetch` resolves it again,
 * so a hostile DNS server can answer differently the second time (a TOCTOU
 * rebind). Closing that requires pinning the resolved address into a custom
 * connect handler, which is not worth the complexity for an internal MVP —
 * documented rather than silently ignored.
 */

/** Hosts allowed to bypass the private-range check (the bundled mock vendor). */
const ALLOWED_HOSTS = new Set(
  (process.env.NOTIFIER_ALLOWED_HOSTS ?? "localhost,127.0.0.1,::1")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
);

export type TargetCheck =
  | { ok: true }
  /**
   * `transient` separates "this target is not allowed" from "we could not tell
   * right now". A private address is a permanent decision and must fail the
   * caller immediately; a DNS lookup that failed may simply be a vendor's
   * resolver having a bad minute, and rejecting valid work for it would be
   * worse than attempting the call and retrying.
   */
  | {
      ok: false;
      kind: "invalid_url" | "blocked_host" | "connection";
      reason: string;
      transient: boolean;
    };

function isPrivateV4(ip: string): string | null {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return "not a valid IPv4 address";
  const [a, b] = p;
  if (a === 10) return "private range 10.0.0.0/8";
  if (a === 127) return "loopback 127.0.0.0/8";
  if (a === 0) return "unspecified 0.0.0.0/8";
  if (a === 169 && b === 254) return "link-local 169.254.0.0/16 (cloud metadata)";
  if (a === 172 && b >= 16 && b <= 31) return "private range 172.16.0.0/12";
  if (a === 192 && b === 168) return "private range 192.168.0.0/16";
  if (a >= 224) return "multicast or reserved";
  return null;
}

function isPrivateV6(ip: string): string | null {
  const v = ip.toLowerCase();
  if (v === "::1") return "IPv6 loopback";
  if (v === "::") return "IPv6 unspecified";
  if (v.startsWith("fc") || v.startsWith("fd")) return "IPv6 unique local fc00::/7";
  if (v.startsWith("fe80")) return "IPv6 link-local fe80::/10";
  // ::ffff:10.0.0.1 style mapped addresses smuggle IPv4 through an IPv6 literal.
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]);
  return null;
}

function privateReason(ip: string): string | null {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateV4(ip);
  if (family === 6) return isPrivateV6(ip);
  return "unrecognised address family";
}

export async function checkTarget(rawUrl: string): Promise<TargetCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return {
      ok: false,
      kind: "invalid_url",
      reason: "URL could not be parsed",
      transient: false,
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      kind: "invalid_url",
      reason: `unsupported protocol ${url.protocol}`,
      transient: false,
    };
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (ALLOWED_HOSTS.has(host)) return { ok: true };

  // An IP literal needs no resolution — check it directly.
  if (net.isIP(host)) {
    const reason = privateReason(host);
    return reason
      ? { ok: false, kind: "blocked_host", reason: `${host} is ${reason}`, transient: false }
      : { ok: true };
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    return {
      ok: false,
      kind: "connection",
      reason: `DNS lookup failed for ${host}`,
      transient: true,
    };
  }

  // Every resolved address must be public: one private answer is enough to
  // reach an internal service, so this is an "all" check, not an "any" check.
  for (const { address } of addresses) {
    const reason = privateReason(address);
    if (reason) {
      return {
        ok: false,
        kind: "blocked_host",
        reason: `${host} resolves to ${address} (${reason})`,
        transient: false,
      };
    }
  }

  return { ok: true };
}
