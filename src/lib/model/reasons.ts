/** Why a layout operation was refused — shown in the editor and returned to MCP clients. */
export const REASONS: Record<string, string> = {
	'need-two': 'Select at least two panels to merge (⇧-click or ⇧+arrow).',
	'not-contiguous': 'Panels must share an edge to merge.',
	'has-hole': 'That merge would enclose a gap — merge the gap too, or use a free panel.',
	'has-merges': 'Split merged panels before changing rows or columns.',
	invalid: 'Rows and columns must be at least 1.'
};
