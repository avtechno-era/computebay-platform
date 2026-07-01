import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { ShowAppDetail } from "@/components/dashboard/simple/apps/show-app-detail";
import { getSimpleLayout } from "@/components/layouts/simple/simple-layout";

const SimpleAppDetail = () => {
	const router = useRouter();
	const appId =
		typeof router.query.appId === "string" ? router.query.appId : "";
	return <ShowAppDetail appId={appId} />;
};

export default SimpleAppDetail;

SimpleAppDetail.getLayout = (page: ReactElement) =>
	getSimpleLayout("apps", "Apps")(page);

export { simpleGetServerSideProps as getServerSideProps } from "@/utils/simple-ssr";
