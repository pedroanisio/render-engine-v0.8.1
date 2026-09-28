/** Explicit compatibility, never inferred from a filename or author. */
/** @param {import('../xsd/validate.js').ValidNode} scene @param {'pivot'|'position'|undefined} mode */
export function checkAnchorMode(scene, mode) {
  if (mode !== undefined && !["pivot", "position"].includes(mode))
    throw new Error("anchorMode must be pivot or position");
  if (mode !== "position") return;
  /** @param {import('../xsd/validate.js').ValidNode} n */
  const visit = (n) => {
    if (
      [
        "object3D",
        "rigidBody",
        "softBody",
        "transformConstraint",
        "deform",
        "skeleton",
        "scene360",
      ].includes(n.name) ||
      (n.name === "project" &&
        n.attributes.mode !== "standard" &&
        n.attributes.mode !== undefined) ||
      n.attributes.threeD === true
    )
      throw new Error(
        `anchorMode=position requires a 2D scene without dynamics or deformation (${n.name})`,
      );
    for (const child of n.children) visit(child);
  };
  visit(scene);
}
