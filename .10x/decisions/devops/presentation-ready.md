# DevOps: presentation-ready
- Ships with the normal flow: owner merges PR #40, then a production deploy from that main SHA (forgedsa-deploy-and-release skill). Production is still the 8 Oct build until then.
- Rollback: revert the fix(wheels) commit, or open the site with ?wheelEnv=0.1 variants to compare; no data or schema to roll back.

## Deployed 2026-11-12
- Production deployment dpl_AcV5FCQ5S21k7oTMVNQnAH3KHd1w from PR #40's head beaffe0 (main f1b45d2 + this branch), on the owner's "deploy it". PR #40 was still open, so main does not hold this code until it is merged.
- Verified: READY, aliased to forged-configurator.vercel.app; the live bundle contains the new wheelEnv code; /, /configure, /admin, /dealer, /rims/forged_fsa002 return 200.
- Rollback: promote dpl_BiwSyADWUFCigXwErYpLNV9xdhCo (the previous production, main 7f7a1e5).
- Caution: production auto-deploys from main. Any main deploy before #40 is merged would remove this fix.
