import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/** Authenticates rate-limit metadata from our Firebase gateway, not a login. */
export function trustedGatewayNetwork(
  request: Request,
  secret?: string,
  now = Date.now(),
): string | null {
  if (!secret || secret.length < 32) return null;
  const timestamp = request.headers.get("x-groundproof-gateway-time") || "";
  const network = request.headers.get("x-groundproof-gateway-network") || "";
  const signature =
    request.headers.get("x-groundproof-gateway-signature") || "";
  if (
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 60000 ||
    !isIP(network) ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return null;
  const url = new URL(request.url);
  const expected = createHmac("sha256", secret)
    .update(
      [timestamp, request.method, url.pathname + url.search, network].join(
        "\n",
      ),
    )
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"))
    ? network
    : null;
}
