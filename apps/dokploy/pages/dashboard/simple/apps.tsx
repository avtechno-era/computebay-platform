import type { ReactElement } from "react";
import { ShowSimpleApps } from "@/components/dashboard/simple/apps/show-simple-apps";
import { getSimpleLayout } from "@/components/layouts/simple/simple-layout";

const SimpleApps = () => <ShowSimpleApps />;

export default SimpleApps;

SimpleApps.getLayout = (page: ReactElement) =>
	getSimpleLayout("apps", "Apps")(page);

export { simpleGetServerSideProps as getServerSideProps } from "@/utils/simple-ssr";
