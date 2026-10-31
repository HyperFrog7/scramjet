declare const SCRAMJET_EXPECTED_VERSION: string;
declare const CONTROLLER_EXPECTED_VERSION: string;

function assertVersionMatch(
	packageName: string,
	expected: string,
	actual: string,
) {
	if (expected !== actual) {
		throw new Error(
			`${packageName} version mismatch: this build expects ${expected}, but the loaded runtime is ${actual}`,
		);
	}
}

export function assertDependencyVersions() {
	if (typeof $scramjet === "undefined") {
		console.error(
			"driftproxy is not loaded. Load scramjet before scramjet-utils.",
		);
	}

	assertVersionMatch(
		"driftproxy",
		SCRAMJET_EXPECTED_VERSION,
		$scramjet.versionInfo.version,
	);

	if (typeof $scramjetController === "undefined") {
		console.error(
			"driftproxy-controller is not loaded. Load the controller before scramjet-utils.",
		);
	}

	assertVersionMatch(
		"driftproxy-controller",
		CONTROLLER_EXPECTED_VERSION,
		$scramjetController.VERSION,
	);
}
