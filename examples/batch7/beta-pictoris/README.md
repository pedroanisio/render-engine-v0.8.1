# Beta Pictoris diagnostic evidence

These are **diagnostic artifacts, not an approved visual delivery**.

- `original.scene.xml` preserves the resolved original project. Its own strict
  safe-area rule rejects the native render.
- `audit.scene.xml` changes only safe-area, flash and contrast enforcement from
  error to warn. It does not convert anchors or alter composition.
- `full-visual-verification.json` checks contiguous frame coverage, decoded
  dimensions and SHA-256 cache receipts for the complete 7,012-frame timeline.
- `audit-192x108.mp4`, when present, is a complete low-resolution diagnostic proxy
  with the native audio mix and captions. `full-export-verification.json` contains
  its decoder/stream evidence. It uses explicit position anchors; XML finishing effects remain enabled.
- `position-5s.png` and four later samples show the corrected anchor placement.
  `reference-5s.png` is the original approximate Python renderer output.
- `pre-fix/` preserves earlier one-second output and accessibility reports from
  before the grain/invisible-element fixes. They are historical evidence only.

The original Python renderer positions an anchor at x/y. The established Batch 2
JavaScript contract uses the anchor as a pivot while x/y translate the local
origin. Use `--anchor-mode position` for that source convention. Native finishing effects
and typography differ from the approximate reference, as documented. See `docs/batch7-validation.md` for remaining acceptance work.

The original 176 MB project assets are not duplicated in this code ZIP. To repeat
the diagnostic run, put `audit.scene.xml` beside those original assets and run:

```sh
node bin/scene-render.js render path/to/audit.scene.xml --output out-master --anchor-mode position --scale 0.1
```

The bundled proxy uses CRF 24 to keep the code ZIP downloadable; the source output
declares CRF 16. It is an audit proxy, not a delivery-resolution visual approval.
