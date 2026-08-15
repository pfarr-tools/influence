# Local deployment instruction

After every edit to this repository, deploy the updated application to the public server with:

```bash
rsync -az --exclude='/content/' ./ peregrinus@peregrinus.de:/home/peregrinus/sites/influence/
```

The `content/` directory is managed separately and must never be included in this deployment. Do not use `--delete` unless the user explicitly requests it.

# Commit message requirement

Every commit message must follow the Conventional Commits format, for example:

```text
feat: add a new capability
fix: correct an incorrect behavior
docs: clarify the setup instructions
chore: update maintenance configuration
```

Use a meaningful type and optional scope, keep the subject concise, and mark
breaking changes with `!` or a `BREAKING CHANGE:` footer. Release automation
uses these commit types to derive version bumps and changelog entries.
