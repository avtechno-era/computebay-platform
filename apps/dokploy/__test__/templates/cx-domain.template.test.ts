import { CX_DOMAIN_TOKEN } from "@dokploy/server/templates";
import {
	type CompleteTemplate,
	processTemplate,
	processValue,
} from "@dokploy/server/templates/processors";
import { describe, expect, it } from "vitest";

// ComputeBay: `${CX_DOMAIN}` resolves to the appliance's own base domain — the
// same bare domain every time — as opposed to `${domain}`, which mints a fresh
// random subdomain per call. See compose.deployTemplate.
const schema = {
	serverIp: "203.0.113.5",
	projectName: "nextcloud",
	wildcardDomain: "cxdomain.com",
};

const baseTemplate = (
	overrides: Partial<CompleteTemplate>,
): CompleteTemplate => ({
	metadata: {
		id: "test",
		name: "test",
		description: "",
		tags: [],
		version: "1.0.0",
		logo: "",
		links: { github: "" },
	},
	variables: {},
	config: { domains: [], env: {} },
	...overrides,
});

describe("${CX_DOMAIN} token", () => {
	it("is spelled CX_DOMAIN", () => {
		expect(CX_DOMAIN_TOKEN).toBe("CX_DOMAIN");
	});

	it("resolves to the appliance base domain, bare", () => {
		expect(processValue("${CX_DOMAIN}", {}, schema)).toBe("cxdomain.com");
	});

	it("builds a stable URL from the base domain", () => {
		expect(processValue("https://api.${CX_DOMAIN}/v1", {}, schema)).toBe(
			"https://api.cxdomain.com/v1",
		);
	});

	it("is stable across references, unlike ${domain}", () => {
		const both = processValue("${CX_DOMAIN}|${CX_DOMAIN}", {}, schema);
		const [first, second] = both.split("|");
		expect(first).toBe(second);

		const randoms = processValue("${domain}|${domain}", {}, schema);
		const [a, b] = randoms.split("|");
		expect(a).not.toBe(b);
	});

	it("resolves inside env values at install time", () => {
		const result = processTemplate(
			baseTemplate({
				config: {
					domains: [],
					env: { PUBLIC_URL: "https://files.${CX_DOMAIN}" },
				},
			}),
			schema,
		);
		expect(result.envs).toContain("PUBLIC_URL=https://files.cxdomain.com");
	});

	it("resolves through template variables", () => {
		const result = processTemplate(
			baseTemplate({
				variables: { base: "${CX_DOMAIN}" },
				config: { domains: [], env: { SITE: "https://${base}" } },
			}),
			schema,
		);
		expect(result.envs).toContain("SITE=https://cxdomain.com");
	});

	it("resolves inside mount contents", () => {
		const result = processTemplate(
			baseTemplate({
				config: {
					domains: [],
					env: {},
					mounts: [{ filePath: "config.yml", content: "host: ${CX_DOMAIN}" }],
				},
			}),
			schema,
		);
		expect(result.mounts[0]?.content).toBe("host: cxdomain.com");
	});

	// Without a wildcard domain the token has nothing to resolve to. The install
	// path in compose.deployTemplate rejects the install before reaching here, so
	// this only pins the resolver's own fallback.
	it("yields an empty string when the appliance has no domain", () => {
		expect(
			processValue("${CX_DOMAIN}", {}, { ...schema, wildcardDomain: null }),
		).toBe("");
	});
});
