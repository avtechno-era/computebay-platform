import type { ReactElement } from "react";
import { ShowSimpleSetup } from "@/components/dashboard/simple/setup/show-simple-setup";

// Focused first-run activation wizard. Renders standalone (no Simple nav) — the
// component provides its own full-screen `cb-shell` container.
const SimpleSetup = () => <ShowSimpleSetup />;

export default SimpleSetup;

SimpleSetup.getLayout = (page: ReactElement) => page;

export { simpleGetServerSideProps as getServerSideProps } from "@/utils/simple-ssr";
