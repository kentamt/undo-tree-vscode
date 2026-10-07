# GitHub publication and VSIX releases

This document describes publication steps. It does not imply that a repository, GitHub Release, or Marketplace listing already exists.

## Create the repository

Create a GitHub repository with the name and visibility you want. When uploading this existing project, leave the new remote empty rather than generating a second README or license.

For a project directory that has not yet been initialized as a Git repository, initialize and inspect the files from its root:

```sh
git init -b main
git add .
git diff --cached --stat
git diff --cached --check
git status --short
```

The `.gitignore` excludes generated VSIX packages, `node_modules`, and macOS metadata. Verify that the staged files contain the project sources and the preserved upstream notices, and no local history data or credentials. Then commit and push, replacing the remote URL with your actual repository:

```sh
git commit -m "Initial source-based undo-tree port for VS Code"
git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
git push -u origin main
```

If working in an already initialized repository, inspect its existing branch and remotes and skip initialization. The commands above are instructions, not actions performed automatically by this project.

Once the URL is known, set the actual `repository`, `homepage`, and `bugs` fields in `package.json`. Do not add example URLs as published metadata. A useful GitHub About description is:

> Branching undo history for VS Code, ported from Emacs undo-tree, with SVG/text views and Emacs navigation keys.

Suggested topics: `vscode-extension`, `emacs`, `undo-tree`, `undo`, `editor`.

## Prepare a version

1. Set the version in `package.json` and update `CHANGELOG.md` and VSIX filenames in both READMEs.
2. Run `npm test`, `npm run check`, and the applicable manual checks in [CONTRIBUTING.md](../CONTRIBUTING.md).
3. Run `npm run package`. This offline packager includes the port, upstream reference sources, notices, tests, documentation, and reproduction scripts.
4. Install the generated VSIX in VS Code and check activation, branching, both visualizer modes, Emacs keys, diff, and persisted history.
5. Commit the exact source used to build the artifact. Include known limitations and any uncompleted manual checks in the release notes.

The optional `npm run package:vsce` uses an independently installed `vsce`; its file selection follows `.vscodeignore`. The offline package command is the documented path for the complete source bundle.

## Publish the artifact

Create a tag for the version on the tested commit. For version 0.4.0:

```sh
git tag -a v0.4.0 -m "Undo Tree 0.4.0"
git push origin main
git push origin v0.4.0
```

Create a GitHub Release for that tag and attach `branching-undo-tree-0.4.0.vsix`. Include a short feature summary, installation instructions, compatibility requirements, and verification details. The matching tagged source keeps the packaged code and its reference files reviewable.

The current extension identifier is `undo-tree-local.branching-undo-tree`. GitHub VSIX distribution uses this identifier; a Marketplace listing is a separate publication step requiring your own publisher setup. Changing the identifier creates a different extension, so account for existing installations and stored history if you change it.
