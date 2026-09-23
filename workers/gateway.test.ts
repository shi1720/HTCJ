import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { trustedGatewayNetwork } from "./gateway.js";
const key = "fixture-gateway-secret-32-characters-minimum",
  time = 1900000000000;
function request(
  path = "/api/state",
  method = "GET",
  timestamp = String(time),
  network = "203.0.113.7",
) {
  const signature = createHmac("sha256", key)
    .update([timestamp, method, path, network].join("\n"))
    .digest("hex");
  return new Request("https://groundproof.example" + path, {
    method,
    headers: {
      "x-groundproof-gateway-time": timestamp,
      "x-groundproof-gateway-network": network,
      "x-groundproof-gateway-signature": signature,
    },
  });
}
describe("Firebase gateway metadata authentication", () => {
  it("accepts only a signed, timely request", () => {
    expect(trustedGatewayNetwork(request(), key, time)).toBe("203.0.113.7");
    expect(trustedGatewayNetwork(request(), undefined, time)).toBeNull();
    expect(trustedGatewayNetwork(request(), key, time + 60001)).toBeNull();
  });
  it("rejects altered path, method, address and signature", () => {
    for (const type of ["path", "method", "network", "signature"]) {
      const original = request(),
        headers = new Headers(original.headers);
      if (type === "network")
        headers.set("x-groundproof-gateway-network", "198.51.100.1");
      if (type === "signature")
        headers.set("x-groundproof-gateway-signature", "0".repeat(64));
      const altered = new Request(
        type === "path"
          ? "https://groundproof.example/api/auth/me"
          : original.url,
        { method: type === "method" ? "POST" : "GET", headers },
      );
      expect(trustedGatewayNetwork(altered, key, time)).toBeNull();
    }
  });
});
