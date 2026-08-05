# Pre-production browser proof, desktop

Candidate SHA a532132d3671a06f566fe6baba106bd0ea8fba11.

Viewport 1280x720. Real Chromium against the real client bundle (`dist/public`,
built from this tree) served by the bounded preview harness
`scripts/preview-early-access.ts`. Both real doors were cleared in the browser:
the outer research wall and the Private Early Access unlock.

## Catalogue

| Fact | Observed |
| --- | --- |
| Catalogue section state | `ok` |
| Rows received from server | 22 |
| Cards rendered | 22 |
| `data-availability="AVAILABLE"` | 18 |
| `data-availability="TEMPORARILY_HELD"` | 4 |
| Focusable elements on page | 79 |

## Cagrilintide (PEX-028), the founder-held unit

| Check | Observed |
| --- | --- |
| Availability | `TEMPORARILY_HELD` |
| Quantity selector (`input`) | 0 |
| Purchase / add-to-cart button (`button`) | 0 |
| `select` controls | 0 |
| Links out of the card (`a[href]`) | 0 |
| Elements merely `[disabled]` | 0 |
| Focusable elements (accessibility tree) | 0 |
| Interactive roles present | none |
| Tab stops inside the card | 0 |
| Price rendered (`$`) | absent |
| Copy | "Not available to order", "Temporarily unavailable" |

The controls are ABSENT from the DOM and the accessibility tree. They are not
hidden and not disabled: the disabled count and the focusable count are both
zero, while the page as a whole exposes 79 focusable elements, so the check is
discriminating rather than vacuously true.

## All four held rows

Combined focusable elements across every `TEMPORARILY_HELD` card: 0.
Cards carrying purchase vocabulary (add to cart / buy / checkout / quantity /
bundle): 0.

## A sellable row, for contrast

AOD-9604 Research Material: 1 button, 3 inputs, price "$56.00 per unit",
"Choose how many units", three-unit limit copy. The purchase path renders
normally, so the absence above is specific to held rows.

## Not captured

Screenshots. The Browser pane was not compositing frames in this environment, so
`computer{action:"screenshot"}` timed out. Every claim above is a structural DOM
and accessibility-tree assertion, which is what the requirement asks for
("absent from the DOM and accessibility tree, not merely hidden or disabled").
Pixel capture remains outstanding and is called out in the go-live report.
