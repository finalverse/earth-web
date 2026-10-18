# GitHub fork-parent verification

Verified 2026-10-19: `finalverse/finalverse-earth` is an immediate fork of **`finalverse/gods-eye-view`**. Its ultimate source remains `bilawalsidhu/gods-eye-view`; original MIT notices and attribution remain intact.

The owner explicitly requested recreation and manually deleted the original GitHub repository after a complete backup. The new fork was created through the documented [Create a fork API](https://docs.github.com/en/rest/repos/forks#create-a-fork), using `finalverse/gods-eye-view` as the source and `finalverse-earth` as the destination name. No GitHub Support request was submitted.

The new repository ID is `1424725034` (previously `1424619305`). All **13 branches and four tags** were restored without force-pushing; remote ref hashes matched the independent bare backup exactly. Main was restored to `e89c2ae306312b765b07c7653943eeba85bd3260` before the maintained-source pin was committed. Description, homepage, feature/merge settings, topics and Actions permissions were restored. The old repository had no releases, pull requests, stars, subscribers, child forks, repository secrets, variables, environments, hooks or rulesets to migrate. Uncommitted v0.2 work was preserved separately and was not included in the restored main branch.

## Verify

```sh
gh api repos/finalverse/finalverse-earth \
  --jq '{id, parent: .parent.full_name, source: .source.full_name}'
```

Expected immediate parent: `finalverse/gods-eye-view`; expected ultimate source: `bilawalsidhu/gods-eye-view`. The GitHub repository header derives its “forked from” link from this relationship. Git remotes and README text alone do not change that metadata.

The [Update a repository API](https://docs.github.com/en/rest/repos/repos#update-a-repository) has no writable fork-parent parameter. Recreation changes repository identity and can lose hosting metadata; it is not a routine update procedure. Future globe updates should follow [the maintained foundation guide](upstream.md), preserving this fork relationship.
