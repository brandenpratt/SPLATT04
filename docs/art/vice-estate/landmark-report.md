# VICE ESTATE 04 — landmark camera fit

Structural anchors projected through the review camera and compared with their
annotated position on the estate master. Errors are in pixels and as a percentage
of the 1919 px image diagonal.

**Gate A camera: FAIL**

| Anchor | Kind | Reference (px) | Projected (px) | Error (px) | % diag | In frame |
|---|---|---|---|---|---|---|
| perimeter-near-right | context | 1455, 872 | 1878, 687 | 462 | 24.1% | NO |
| perimeter-near-left | context | 105, 855 | -206, 687 | 354 | 18.4% | NO |
| perimeter-far-right | structural | 1652, 400 | 1363, 372 | 290 | 15.1% | yes |
| perimeter-far-left | structural | 25, 315 | 309, 372 | 290 | 15.1% | yes |
| dock-end | context | 1043, 128 | 880, 343 | 269 | 14.0% | yes |
| yacht-center | context | 1105, 140 | 939, 342 | 261 | 13.6% | yes |
| villa-east-roof-outer-right | structural | 1565, 240 | 1315, 281 | 253 | 13.2% | yes |
| villa-east-roof-outer-left | structural | 1133, 200 | 1000, 281 | 156 | 8.1% | yes |
| villa-west-roof-outer-right | structural | 690, 155 | 663, 283 | 131 | 6.8% | yes |
| bridge-attach-right | structural | 1105, 268 | 996, 315 | 119 | 6.2% | yes |
| villa-west-roof-outer-left | structural | 293, 200 | 361, 283 | 108 | 5.6% | yes |
| fountain-center | structural | 855, 600 | 836, 499 | 103 | 5.4% | yes |
| bridge-attach-left | structural | 715, 250 | 676, 315 | 75 | 3.9% | yes |
| chrome-orb-center | structural | 1020, 365 | 1024, 433 | 68 | 3.6% | yes |
| horizon-center | context | 836, 62 | 836, 49 | 13 | 0.7% | yes |

Structural mean **8.31%**, median 6.51%, max 15.14%.

Failing criteria:

- perimeter-far-left 15.1% > 4.0% limit
- perimeter-far-right 15.1% > 4.0% limit
- villa-west-roof-outer-left 5.6% > 3.0% limit
- villa-west-roof-outer-right 6.8% > 3.0% limit
- villa-east-roof-outer-left 8.1% > 3.0% limit
- villa-east-roof-outer-right 13.2% > 3.0% limit
- fountain-center 5.4% > 2.0% limit
- chrome-orb-center 3.6% > 3.0% limit
- bridge-attach-left 3.9% > 3.0% limit
- bridge-attach-right 6.2% > 3.0% limit
- structural mean 8.3% > 3.0% limit

