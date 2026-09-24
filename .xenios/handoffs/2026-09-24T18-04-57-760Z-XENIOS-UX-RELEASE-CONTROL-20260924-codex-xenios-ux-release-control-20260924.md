# Xenios live-UAT repair — exact-SHA handoff

Runtime candidate: `0574264562f33fe40572b1d9976f4700bef9c83e`

Runtime tree: `0f4c05b8fa8e4d927c8de693085b58d96ac1febd`

Reconciled base: `6d9ec3cb615f0c48102e74974e777c07e7039eba`

Production base remains `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`. Production was not mutated.

The closed Research membership application now states that no application can be started or submitted and provides six supported alternatives. The status page distinguishes neutral no-token secure-link requests from invalid or expired tokens. Product-oriented membership calls to action now prefer the supported Research order route. No Research access-interest intake was added.

Verification passed: focused live-UAT tests (150), focused release-control tests (172 passed, 1 skipped), core-site protection, full serial suite (971 files passed, 6 skipped; 18,036 tests passed, 85 skipped), typecheck, production build, 390 x 844 browser UAT, desktop browser UAT, continuity validation, and diff check.

Deploy only runtime SHA `0574264562f33fe40572b1d9976f4700bef9c83e` after a separate exact-SHA production GO. Do not deploy the later handoff-only successor commit.
