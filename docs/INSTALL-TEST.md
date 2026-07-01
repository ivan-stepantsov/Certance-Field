# Certance Token Kit - Clean Install Test

Run this checklist before sending the kit to any customer. Do it in a clean VS Code window (no existing Certance Token Kit installed).

Estimated time: 10-15 minutes.

---

## Pre-test setup

1. Confirm no previous version is installed:
   ```
   Cmd+Shift+P -> Extensions: Show Installed Extensions
   ```
   Search "Certance Token Kit" - should return nothing.

2. If an old version is present, uninstall it and reload VS Code before continuing.

---

## Step 1 - Install the VSIX

```bash
code --install-extension vscode-extension/ce-token-kit-0.2.64.vsix
```

**Expected:** VS Code reloads. Status bar shows `$(graph) CE: 0t saved` in the bottom-left area.

**Fail signal:** No status bar item, or an error notification on startup.

---

## Step 2 - CE: Optimize Prompt

1. Open any `.ts` or `.js` file in VS Code
2. `Cmd+Shift+P` -> **CE: Optimize Prompt**
3. Enter: `please fix the failing test, don't change the API`
4. Press Enter

**Expected:**
- A new Markdown document opens showing the optimized prompt
- The prompt starts with an imperative (`Fix the failing test.`)
- A `Constraint:` line appears for `don't change the API`
- A `[TypeScript]` or language tag is injected (if a `.ts` file was open)
- A response shape line appears at the end (`Return the minimal change needed...`)
- Notification: "Prompt optimized and copied to clipboard. Saved ~N tokens."
- Clipboard contains the optimized prompt (paste to verify)
- Status bar updates to show tokens saved (e.g., `CE: 8t saved`)

**Fail signal:** Error notification, blank document, or no status bar update.

---

## Step 3 - CE: Review Diff

1. Select the following text in any editor (copy-paste it, then select it):
   ```
   -  const user = getUser(id)
   +  const user = await getUser(id)
   +  if (!user) throw new Error('User not found')
   ```
2. `Cmd+Shift+P` -> **CE: Review Diff**

**Expected:**
- A new Markdown document opens with diff review framing
- Content focuses on changed behavior, not a general explanation
- Clipboard contains the compressed diff output
- Status bar token count increments

**Fail signal:** Warning "selection does not look like a diff" - the selection may not have been picked up. Try selecting more clearly diff-like content (lines starting with `+`/`-`).

---

## Step 4 - CE: Debug Stack Trace

1. Select the following text:
   ```
   Error: Expected locator to be visible
       at LoginPage.clickSubmit (pages/LoginPage.ts:42)
       at Context.<anonymous> (tests/auth.spec.ts:18)
   ```
2. `Cmd+Shift+P` -> **CE: Debug Stack Trace**

**Expected:**
- A new Markdown document opens with root cause framing
- Top error is surfaced first, followed by the smallest plausible fix
- Clipboard contains the compressed stack output

**Fail signal:** Warning "selection does not look like a stack trace."

---

## Step 5 - CE: Explain Selection

1. Select any function body (5-20 lines) in an open file
2. `Cmd+Shift+P` -> **CE: Explain Selection**

**Expected:**
- A new Markdown document opens with an explanation-oriented summary
- Clipboard contains the compressed selection

---

## Step 6 - CE: Show Local Stats

`Cmd+Shift+P` -> **CE: Show Local Stats**

**Expected:**
- A Markdown document titled `# Certance Token Kit - Stats` opens
- Shows non-zero values for prompt runs, command counts, and token totals (from steps 2-5)
- Stats are cumulative across the test session

---

## Step 7 - CE: Reset Local Stats

`Cmd+Shift+P` -> **CE: Reset Local Stats**

**Expected:**
- Notification: "Certance Token Kit local stats reset."
- Status bar returns to `CE: 0t saved`
- Running **CE: Show Local Stats** again shows all zeros

---

## Pass criteria

All six commands must produce their expected output with no error notifications. Status bar must be present and update correctly.

| Command | Pass | Notes |
|---|---|---|
| CE: Optimize Prompt | ☐ | |
| CE: Review Diff | ☐ | |
| CE: Debug Stack Trace | ☐ | |
| CE: Explain Selection | ☐ | |
| CE: Show Local Stats | ☐ | |
| CE: Reset Local Stats | ☐ | |

---

## If something fails

1. Open the VS Code Output panel (`View -> Output`) and select **Certance Token Kit** from the dropdown
2. Check the Developer Tools console (`Help -> Toggle Developer Tools`) for uncaught errors
3. The most common failure mode is a missing `src/shared/` in the VSIX - verify with:
   ```bash
   python3 -c "import zipfile; z=zipfile.ZipFile('vscode-extension/ce-token-kit-0.2.64.vsix'); [print(n) for n in sorted(z.namelist())]"
   ```
   Look for `extension/src/shared/lib/index.js` in the output. If absent, rebuild:
   ```bash
   cd vscode-extension && npm install && npm run package:vsix
   ```
