import { generateRandomDomain } from "@dokploy/server/templates";
import { describe, expect, it } from "vitest";

// ComputeBay: curated installs ride the appliance's own wildcard domain instead
// of the public sslip.io fallback (see compose.deployTemplate + catalog subdomains).
describe("generateRandomDomain — wildcard domain", () => {
	it("falls back to sslip.io when no wildcard domain is configured", () => {
		const host = generateRandomDomain({
			serverIp: "203.0.113.5",
			projectName: "nextcloud",
		});
		expect(host).toMatch(/\.sslip\.io$/);
		expect(host).toContain("nextcloud-");
	});

	it("mints a host under the appliance wildcard domain when set", () => {
		const host = generateRandomDomain({
			serverIp: "203.0.113.5",
			projectName: "nextcloud",
			wildcardDomain: "cxdomain.com",
		});
		expect(host).toMatch(/^nextcloud-[0-9a-f]{6}\.cxdomain\.com$/);
		expect(host).not.toContain("sslip.io");
	});

	it("null wildcard domain behaves like unset (sslip.io)", () => {
		const host = generateRandomDomain({
			serverIp: "203.0.113.5",
			projectName: "app",
			wildcardDomain: null,
		});
		expect(host).toMatch(/\.sslip\.io$/);
	});
});
