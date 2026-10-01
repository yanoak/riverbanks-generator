// QR codes as vector paths, for the board footer's link (see model/bands.ts footer.qr).

import qrcode from 'qrcode-generator';

/** The code's modules, row by row; true is dark. Error correction M survives a scuffed board. */
export function qrMatrix(data: string): boolean[][] {
	const qr = qrcode(0, 'M');
	qr.addData(data);
	qr.make();
	const n = qr.getModuleCount();
	return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** One SVG path, a unit square per dark module; draw it in a viewBox of the matrix's size. */
export function qrPath(matrix: boolean[][]): string {
	let d = '';
	matrix.forEach((row, r) =>
		row.forEach((dark, c) => {
			if (dark) d += `M${c} ${r}h1v1h-1z`;
		})
	);
	return d;
}
