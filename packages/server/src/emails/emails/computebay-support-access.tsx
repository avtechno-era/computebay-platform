import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

export type TemplateProps = {
	date: string;
	businessName?: string | null;
	reason?: string | null;
};

// Sent to the owner when an Avante support session begins, if they opted in
// (ComputeBay managed tier, spec §5.9).
export const ComputeBaySupportAccessEmail = ({
	date = "2023-05-01T00:00:00.000Z",
	businessName = null,
	reason = null,
}: TemplateProps) => {
	const previewText = "Avante support just connected to your appliance";
	return (
		<Html>
			<Preview>{previewText}</Preview>
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								brand: "#007291",
							},
						},
					},
				}}
			>
				<Head />

				<Body className="bg-white my-auto mx-auto font-sans px-2">
					<Container className="border border-solid border-[#eaeaea] rounded-lg my-[40px] mx-auto p-[20px] max-w-[465px]">
						<Heading className="text-black text-[22px] font-normal text-center p-0 my-[30px] mx-0">
							Avante support connected
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Hello{businessName ? ` ${businessName}` : ""},
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							An Avante support session just started on your ComputeBay
							appliance. You allowed support access, so this is expected — but we
							let you know every time, as promised.
						</Text>

						<Section className="text-black text-[14px] leading-[24px] bg-[#F4F4F5] rounded-lg p-3">
							<Text className="!leading-4 font-bold m-0">Details</Text>
							<Text className="!leading-4 m-0">
								Started: <strong>{date}</strong>
							</Text>
							{reason ? (
								<Text className="!leading-4 m-0">
									Reason: <strong>{reason}</strong>
								</Text>
							) : null}
						</Section>

						<Text className="text-black text-[14px] leading-[24px] mt-4">
							You can review every support session, or pause support access at any
							time, from Settings → Support access.
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default ComputeBaySupportAccessEmail;
