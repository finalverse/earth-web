# Maintained globe foundation

The source relationship is **bilawalsidhu/gods-eye-view → finalverse/gods-eye-view → finalverse/finalverse-earth**. GitHub's immediate fork parent now also points to the maintained Finalverse foundation; see the [fork-parent verification record](github-fork-parent.md). This metadata is separate from the build dependency selector. All branches, tags and commit history were preserved during the owner-authorized recreation.

The maintained globe checkout has `origin` pointing to `finalverse/gods-eye-view` and `original` pointing to the original project. Earth has `origin` pointing to its own repository and `globe-upstream` pointing only to the maintained fork. A fresh clone needs only `origin`; the optional update tool uses the explicit maintained URL in the lock.

## Pinned source snapshot

Earth already contains the inherited source and full Git history. Moving those files into a submodule would duplicate or relocate a working application and disrupt its tests/exports. A pinned source dependency therefore fits this architecture better than a nested checkout. `earth/globe.lock.json` records the maintained repository, exact commit, SHA-256 of every upstream file used by Earth and the original license, plus the resolved Cesium/build-plugin versions. `earth/upstream.mjs verify` checks these files offline. It runs before the Earth build. No build fetches source from the original repository.

The retained full upstream application remains a regression reference. Its unrelated feeds/assets are not dependencies of the Earth entry point and are not automatically admitted by this pin.

## Update procedure

1. In the maintained globe repository, fetch `original/main`, inspect commits and licenses, and merge reviewed upstream changes into its own branch without rewriting history. Run its build and tests before pushing its main branch.
2. In Earth, choose a **full commit SHA already present in the maintained fork**. Run `node earth/upstream.mjs prepare <sha> /temporary/path/globe.patch`. This fetches only the maintained repository and creates a patch plus candidate lock. It applies nothing.
3. Review the patch, API changes, dependency versions, licenses and dataset terms. Apply reviewed changes with normal Git tools, reconcile renderer dependency pins, then replace the lock with the reviewed candidate. Never bless an unexplained file mismatch by hashing the working tree.
4. Run the remote-pin check (`node earth/upstream.mjs fetch`), offline verification, Earth tests/build/artifact audit, upstream regression suite and combined browser/headless checks. Commit the source update separately from product changes.

The baseline pin is `93ea088f4556a5a65b3292a2d15142d5a6c562bc`. At the reorganization audit, original and maintained main both resolved to that commit, so redirecting the dependency required no renderer changes. MIT notices and Bilawal Sidhu/upstream attribution remain intact. Third-party data rights remain separate.
