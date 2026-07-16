# assets

Brand logo variants for the generator pages.

| File | Background | Use |
|---|---|---|
| `logo-light.svg` | white rounded tile | app icon / light backgrounds |
| `logo-dark.svg` | dark rounded tile | app icon / dark backgrounds |
| `logo-mark-light-transparent.svg` | transparent | mark only, for light backgrounds |
| `logo-mark-dark-transparent.svg` | transparent | mark only, for dark backgrounds |

The app header (`delivery-plan.html`, light background) embeds
`logo-mark-light-transparent.svg` as a data URI (viewBox cropped to the
artwork) so the page stays self-contained and works offline. To change the
header logo, replace the relevant file here and it gets re-embedded.
