/**
 * 2D anchors follow one convention only (CONVENTIONS 1.1): x/y place the
 * anchor point. The former "pivot" compatibility mode is rejected; "position"
 * is accepted as a no-op for callers that still pass it explicitly.
 * @param {unknown} mode
 */
export function checkAnchorMode(mode) {
  if (mode !== undefined && mode !== "position")
    throw new Error(
      'anchorMode "pivot" is no longer supported: x/y always place the anchor point',
    );
}
