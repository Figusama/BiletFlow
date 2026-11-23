/**
 * DESIGN PLACEHOLDER
 *
 * Temporary AI-assisted SVG composition used only to evaluate
 * the Events hero layout during the design phase.
 *
 * This is NOT a production illustration.
 * Replace it with the final event-venue artwork before release.
 */

const EventArenaPlaceholder = () => {
	return (
		<div
			aria-hidden="true"
			className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-[52%] lg:block"
		>
			<svg
				viewBox="0 0 760 470"
				className="h-full w-full"
				fill="none"
				xmlns="http://www.w3.org/2000/svg"
			>
				{/* Very subtle stage lights */}
				<path
					d="M430 55L510 310"
					className="stroke-accent"
					strokeWidth="2"
					opacity="0.08"
				/>
				<path
					d="M555 45L535 310"
					className="stroke-accent"
					strokeWidth="2"
					opacity="0.1"
				/>
				<path
					d="M675 75L560 310"
					className="stroke-accent"
					strokeWidth="2"
					opacity="0.07"
				/>

				{/* Hanging lights */}
				<circle cx="430" cy="55" r="4" className="fill-accent" opacity="0.7" />
				<circle cx="555" cy="45" r="4" className="fill-accent" opacity="0.7" />
				<circle cx="675" cy="75" r="4" className="fill-accent" opacity="0.7" />

				{/* Rear wall / stage frame */}
				<path
					d="M445 170H650L675 300H420L445 170Z"
					fill="#1D2025"
					stroke="#3A3E45"
					strokeWidth="2"
				/>

				{/* Stage screen */}
				<rect
					x="475"
					y="195"
					width="145"
					height="76"
					rx="5"
					fill="#242830"
					stroke="#444951"
				/>

				{/* Screen detail */}
				<path
					d="M505 234H590"
					className="stroke-accent"
					strokeWidth="3"
					strokeLinecap="round"
					opacity="0.75"
				/>

				{/* Stage */}
				<path
					d="M435 300H662L700 335H395L435 300Z"
					fill="#292D33"
					stroke="#484D55"
					strokeWidth="2"
				/>

				{/* Stage front */}
				<path
					d="M395 335H700L684 359H410L395 335Z"
					fill="#202328"
				/>

				{/* Seating tiers */}
				<path
					d="M350 365C438 395 620 395 718 360"
					stroke="#454A52"
					strokeWidth="2"
				/>

				<path
					d="M315 390C430 435 630 435 744 385"
					stroke="#3C4148"
					strokeWidth="2"
				/>

				<path
					d="M280 415C420 470 650 470 760 410"
					stroke="#34383F"
					strokeWidth="2"
				/>

				{/* First seating row */}
				<g fill="#70757D">
					<circle cx="390" cy="371" r="4" />
					<circle cx="420" cy="378" r="4" />
					<circle cx="451" cy="383" r="4" />
					<circle cx="483" cy="387" r="4" />
					<circle cx="516" cy="389" r="4" />
					<circle cx="549" cy="389" r="4" />
					<circle cx="582" cy="386" r="4" />
					<circle cx="614" cy="382" r="4" />
					<circle cx="645" cy="376" r="4" />
					<circle cx="675" cy="369" r="4" />
				</g>

				{/* Second seating row */}
				<g fill="#5D626A">
					<circle cx="355" cy="397" r="4" />
					<circle cx="389" cy="408" r="4" />
					<circle cx="425" cy="416" r="4" />
					<circle cx="462" cy="422" r="4" />
					<circle cx="500" cy="425" r="4" />
					<circle cx="538" cy="426" r="4" />
					<circle cx="576" cy="424" r="4" />
					<circle cx="614" cy="418" r="4" />
					<circle cx="650" cy="410" r="4" />
					<circle cx="685" cy="399" r="4" />
					<circle cx="715" cy="389" r="4" />
				</g>

				{/* A few accent seats */}
				<g className="fill-accent">
					<circle cx="483" cy="387" r="4.5" />
					<circle cx="516" cy="389" r="4.5" />
					<circle cx="538" cy="426" r="4.5" />
				</g>
			</svg>
		</div>
	)
}

export default EventArenaPlaceholder