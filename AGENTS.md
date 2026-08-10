# Local deployment instruction

After every edit to this repository, deploy the updated application to the public server with:

```bash
rsync -az --exclude='/content/' ./ peregrinus@peregrinus.de:/home/peregrinus/sites/influence/
```

The `content/` directory is managed separately and must never be included in this deployment. Do not use `--delete` unless the user explicitly requests it.
