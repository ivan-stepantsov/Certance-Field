# Branding editions

The extension ships as **one engine with two skins**. The code, tests,
`SECURITY.md`, and the `@cetoken` name are identical across editions; only the
identity fields differ, driven by a profile here.

| Profile | Publisher | Licence | Owner | Use |
|---|---|---|---|---|
| `personal.json` | `ivan-stepantsov` | MIT | Ivan Stepantsov | **Default.** Personal project - the committed build and the VSIX in the repo. |
| `certance.json` | `ce-advisory` | UNLICENSED | Certance Advisory | Certance-branded edition for consulting/customer delivery. |

A profile drives only: `publisher`, `displayName`, `description`, `license`, the
`LICENSE.txt` text, and the chat-participant id (`<publisher>.cetoken`). The
`@cetoken` name a user types is the same in both.

## Build an edition

```bash
cd vscode-extension
npm run package:personal    # stamp personal + build ce-token-kit-<v>.vsix
npm run package:certance    # stamp Certance + build ce-token-kit-<v>.vsix
```

`brand:personal` / `brand:certance` stamp without building;
`brand:check` verifies the working tree matches the **personal** default
(CI runs this so `main` never drifts to a different edition).

> After building the Certance edition locally, run `npm run brand:personal`
> before committing - `main` is always the personal edition. CI enforces this.

## Why one repo, not a fork

The engine had a duplication problem once already; forking it into two repos
would bring that back. A profile keeps a single source of truth and lets either
identity be produced on demand. To split the personal edition into its own
GitHub repo later, this layer makes it a copy-and-build, not a rewrite.
