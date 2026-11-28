/* BEFN Sumo predictor v2: evaluate a compact gradient-boosted tree model in the browser.
   Model format (written by scripts/sumo-build-model.mjs from a LightGBM dump):
   { features: [names], base: number, trees: [[node, ...], ...] } where a node is
   [featureIndex, threshold, left, right, missingGoesLeft] for a split, or [-1, value] for a leaf;
   left/right are node indices in the same tree. Missing values (null/NaN) follow missingGoesLeft. */
export function treeScore(model, x) {
  let s = model.base || 0;
  for (const t of model.trees) {
    let i = 0;
    for (;;) {
      const n = t[i];
      if (n[0] < 0) { s += n[1]; break; }
      const v = x[n[0]];
      i = v == null || Number.isNaN(v) ? (n[4] ? n[2] : n[3]) : v <= n[1] ? n[2] : n[3];
    }
  }
  return s;
}
export const treeProbability = (model, x) => 1 / (1 + Math.exp(-treeScore(model, x)));
