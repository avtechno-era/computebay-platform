import type { ReactElement } from "react";
import { ShowSimpleSettings } from "@/components/dashboard/simple/settings/show-simple-settings";
import { getSimpleLayout } from "@/components/layouts/simple/simple-layout";

const SimpleSettings = () => <ShowSimpleSettings />;

export default SimpleSettings;

SimpleSettings.getLayout = (page: ReactElement) =>
	getSimpleLayout("settings", "Settings")(page);

export { simpleGetServerSideProps as getServerSideProps } from "@/utils/simple-ssr";
