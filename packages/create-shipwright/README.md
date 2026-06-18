# create-shipwright

Scaffold a new project from the [shipwright](https://github.com/writingdeveloper/shipwright)
Next.js + Turborepo starter.

```sh
npx create-shipwright my-app
```

It downloads the `writingdeveloper/shipwright` repo (degit-style tarball, no git
history) into a new directory, then optionally runs `git init` and installs
dependencies.

## Usage

```sh
npx create-shipwright [directory] [options]
```

### Options

| Option | Description |
| --- | --- |
| `--template <source>` | giget source or a local dir to copy from (default: `github:writingdeveloper/shipwright`) |
| `--ref <branch\|tag>` | Git ref of the default repo (default: `main`) |
| `--pm <pnpm\|npm\|yarn\|bun>` | Package manager for install (default: `pnpm`, auto-detected from the runner) |
| `--no-git` | Do not run `git init` |
| `--no-install` | Do not install dependencies |
| `--force` | Allow scaffolding into a non-empty directory |
| `--dry-run` | Resolve and print the plan; download/write nothing |
| `-h, --help` | Show help |
| `-v, --version` | Show the version |

### Examples

```sh
npx create-shipwright my-app
npx create-shipwright my-app --ref v0.2.0 --pm npm
npx create-shipwright my-app --no-install --no-git
npx create-shipwright my-app --dry-run
```

After scaffolding, copy `apps/web/.env.example` to `apps/web/.env`, fill in
`BETTER_AUTH_SECRET`, and run `pnpm dev`. See the generated project's `DEPLOY.md`
for deployment.

## License

[MIT](https://github.com/writingdeveloper/shipwright/blob/main/LICENSE)
