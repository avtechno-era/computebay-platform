import { validateRequest } from "@dokploy/server/lib/auth";
import { createServerSideHelpers } from "@trpc/react-query/server";
import type { GetServerSidePropsContext } from "next";
import superjson from "superjson";
import { appRouter } from "@/server/api/root";

/**
 * Shared getServerSideProps for Simple-shell pages: enforces auth, redirects to
 * "/" when signed out, and prefetches the fork config + apps list every Simple
 * page needs (sidebar identity, tier, health).
 */
export async function simpleGetServerSideProps(ctx: GetServerSidePropsContext) {
	const { req, res } = ctx;
	const { user, session } = await validateRequest(req);

	if (!user) {
		return {
			redirect: { permanent: false, destination: "/" },
		};
	}

	const helpers = createServerSideHelpers({
		router: appRouter,
		ctx: {
			req: req as any,
			res: res as any,
			db: null as any,
			session: session as any,
			user: user as any,
		},
		transformer: superjson,
	});

	await Promise.all([
		helpers.settings.isCloud.prefetch(),
		helpers.user.get.prefetch(),
		helpers.computebay.getConfig.prefetch(),
		helpers.computebay.listApps.prefetch(),
	]);

	return {
		props: {
			trpcState: helpers.dehydrate(),
		},
	};
}
