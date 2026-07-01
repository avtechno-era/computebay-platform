import type { ContainerCreateOptions } from "dockerode";
import { getRemoteDocker } from "../utils/servers/remote-docker";

// cloudflared runs on the appliance as a fork-managed Docker container (the same
// way Dokploy manages its Traefik container). It dials out to Cloudflare with the
// per-appliance connector token the broker issued at activation, and forwards
// public traffic to Traefik's `web` entrypoint — see the broker's tunnel ingress
// (provision_appliance_tunnel). It is only ever started on managed-tier
// appliances once a tunnel token exists.
//
// HOST SEAM: cloudflared must reach Traefik and NOTHING must publish Traefik's
// public port on the WAN directly — the tunnel is the only public path. On a
// single-node appliance both containers share `dokploy-network`, so cloudflared
// reaches Traefik as `http://dokploy-traefik:80`, which matches the ingress
// service the broker configures.

export const CLOUDFLARED_CONTAINER_NAME = "computebay-cloudflared";
export const CLOUDFLARED_IMAGE =
	process.env.CLOUDFLARED_IMAGE || "cloudflare/cloudflared:latest";

// (Re)create and start the cloudflared container with the given connector token.
// Idempotent: any existing container is removed first so a rotated token or a new
// image is picked up cleanly.
export const initializeCloudflared = async (token: string) => {
	if (!token) {
		throw new Error("Cannot start cloudflared without a tunnel token");
	}

	const settings: ContainerCreateOptions = {
		name: CLOUDFLARED_CONTAINER_NAME,
		Image: CLOUDFLARED_IMAGE,
		Cmd: ["tunnel", "--no-autoupdate", "run", "--token", token],
		NetworkingConfig: {
			EndpointsConfig: {
				"dokploy-network": {},
			},
		},
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
		},
	};

	const docker = await getRemoteDocker();
	try {
		await docker.pull(CLOUDFLARED_IMAGE);
		await new Promise((resolve) => setTimeout(resolve, 3000));
		console.log("cloudflared Image Pulled ✅");
	} catch (error) {
		console.log("cloudflared Image Not Found: Pulling ", error);
	}

	try {
		const container = docker.getContainer(CLOUDFLARED_CONTAINER_NAME);
		await container.remove({ force: true });
		await new Promise((resolve) => setTimeout(resolve, 3000));
	} catch {}

	try {
		await docker.createContainer(settings);
		const newContainer = docker.getContainer(CLOUDFLARED_CONTAINER_NAME);
		await newContainer.start();
		console.log("cloudflared Started ✅");
	} catch (error) {
		console.log("cloudflared failed to start ", error);
		throw error;
	}
};

// Tear down the cloudflared container (e.g. on suspension or self-host with no
// tunnel). No-op if it isn't running.
export const stopCloudflared = async () => {
	const docker = await getRemoteDocker();
	try {
		const container = docker.getContainer(CLOUDFLARED_CONTAINER_NAME);
		await container.remove({ force: true });
		console.log("cloudflared Stopped ✅");
	} catch {}
};

// Whether the cloudflared container is present and running on this host.
export const isCloudflaredRunning = async (): Promise<boolean> => {
	const docker = await getRemoteDocker();
	try {
		const container = docker.getContainer(CLOUDFLARED_CONTAINER_NAME);
		const info = await container.inspect();
		return info.State?.Running === true;
	} catch {
		return false;
	}
};
