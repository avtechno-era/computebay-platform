import type { ReactElement } from "react";
import { ShowSimpleBackups } from "@/components/dashboard/simple/backups/show-simple-backups";
import { getSimpleLayout } from "@/components/layouts/simple/simple-layout";

const SimpleBackups = () => <ShowSimpleBackups />;

export default SimpleBackups;

SimpleBackups.getLayout = (page: ReactElement) =>
	getSimpleLayout("backups", "Backups")(page);

export { simpleGetServerSideProps as getServerSideProps } from "@/utils/simple-ssr";
