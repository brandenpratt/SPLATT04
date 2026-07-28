# Reference images

Master art-direction references for VICE ESTATE 04. These are the ground truth for the
Gate A composition review: the Blender blockout camera is matched against them, and the
side-by-side comparison renders are generated from them.

Required files (not yet present — see the milestone report):

| File                       | What it is                                                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vice-estate-master.png`   | The estate composition: two villas, orange roofs, glass bridge, chrome flamingo fountain, black inflatable perimeter, waterfront, dock, yacht, palms. |
| `miami-skyline-master.png` | The layered Miami skyline backdrop and golden-hour sky treatment.                                                                                     |

Save both at the highest resolution available. `tools/blender/render_vice_estate_review.py`
reads them directly to build the overlay and side-by-side comparison sheets, and will fail
with a clear message if either is missing.
