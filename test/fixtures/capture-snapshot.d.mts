export interface SnapshotCaptureInput {
	ui: {
		renderNow(): void;
		render?(width: number): string[];
		getFocusedComponent(): { render(width: number): string[] } | null;
	};
	terminal: { columns: number; rows: number };
	directory: string;
	version: string;
	mode: string;
	theme: string;
}

export function createSnapshotCapture(
	input: SnapshotCaptureInput,
): (stage: string, suppliedLines?: string[]) => Promise<void>;
