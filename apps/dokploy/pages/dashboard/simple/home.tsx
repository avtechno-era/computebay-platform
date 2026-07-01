import type { ReactElement } from "react";
import { ShowSimpleHome } from "@/components/dashboard/simple/home/show-simple-home";
import { getSimpleLayout } from "@/components/layouts/simple/simple-layout";

const SimpleHome = () => <ShowSimpleHome />;

export default SimpleHome;

SimpleHome.getLayout = (page: ReactElement) =>
	getSimpleLayout("home", "Home")(page);

export { simpleGetServerSideProps as getServerSideProps } from "@/utils/simple-ssr";
