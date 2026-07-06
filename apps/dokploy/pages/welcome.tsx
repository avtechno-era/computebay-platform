import { IS_CLOUD, isAdminPresent } from "@dokploy/server";
import type { GetServerSidePropsContext } from "next";
import type { ReactElement } from "react";
import { FirstBootSetup } from "@/components/dashboard/simple/setup/first-boot-setup";

// ComputeBay first-boot landing (replaces Dokploy's stock /register as the very
// first screen). Managed vs self-host choice; the component owns its full-screen
// container, so it renders standalone with no layout chrome.
const Welcome = () => <FirstBootSetup />;

export default Welcome;

Welcome.getLayout = (page: ReactElement) => page;

export async function getServerSideProps(_context: GetServerSidePropsContext) {
	// First-boot setup is a self-host/appliance concern only, and only runs while
	// the box has no administrator. Once an owner exists (or in cloud), send them
	// to the normal entry point.
	if (IS_CLOUD) {
		return { redirect: { permanent: false, destination: "/" } };
	}
	const hasAdmin = await isAdminPresent();
	if (hasAdmin) {
		return { redirect: { permanent: false, destination: "/" } };
	}
	return { props: {} };
}
