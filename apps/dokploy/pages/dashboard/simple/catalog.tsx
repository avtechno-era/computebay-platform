import type { ReactElement } from "react";
import { ShowCatalog } from "@/components/dashboard/simple/catalog/show-catalog";
import { getSimpleLayout } from "@/components/layouts/simple/simple-layout";

const SimpleCatalog = () => <ShowCatalog />;

export default SimpleCatalog;

SimpleCatalog.getLayout = (page: ReactElement) =>
	getSimpleLayout("catalog", "Catalog")(page);

export { simpleGetServerSideProps as getServerSideProps } from "@/utils/simple-ssr";
