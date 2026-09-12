<div align="center">

# SuYan 素言

[简体中文](./README.md) | **English**

**A local-first AI prompt, image, and creative-material manager**

Keep artwork, videos, prompts, categories, tags, and creative plans together so they are easy to find, reuse, organize, and share.

[GitHub](https://github.com/guliacer/SuYan) · [Features](#features) · [Quick start](#quick-start) · [Changelog](#changelog) · [FAQ](#faq)

**Free forever · MIT licensed · No paid activation**

<br />

<img src="./photo/readme/library.png" alt="SuYan library" width="100%" />

</div>

> SuYan stores materials, prompts, settings, and logs locally by default. Sign-in is used for identity, authorship, and account-verified imports; it is not cloud sync. Local work created before sign-in is not automatically uploaded or claimed.

## Features

### Local library

- Browse images, videos, and grouped artwork in a responsive masonry or grid / list view.
- Search titles, filenames, prompts, categories, and tags; filter by favorites and sort by time, size, or random order.
- Edit positive / negative prompts, copy text or images, favorite items, manage categories and tags, record model information, and keep multiple artwork files per prompt group.
- Keep the original artwork first in a group; later imports are appended by import time.
- Recover gracefully when thumbnails are missing, generating, or failed by waiting or falling back to the original media.

<img src="./photo/readme/library.png" alt="Library browsing" width="100%" />

### Import, batch processing, and export

- Import local images / videos, paste clipboard images, read Word documents, import share ZIPs, or parse supported web share links.
- Mount existing media folders as external indexes without copying or deleting the original files. Watch, re-locate, rescan, and clean missing indexes when needed.
- Batch-select, copy, delete, deduplicate, compress images, and compress videos.
- Export runs with progress in the background so the main UI remains usable; import and export dialogs remember the last folder.
- Prompt share packages can include the selected works' related category and tag knowledge, groups, and covers.
- Export filenames include the app name, version, content type, and timestamp.

<img src="./photo/readme/import-menu.png" alt="Import options" width="100%" />

### AI assistant

- Configure providers, models, and rules independently for category recognition, tag recognition, prompt optimization, translation, image reverse prompting, and generation.
- Analyze categories and tags from either the prompt or artwork. Model selectors use the provider's actual model IDs and remember each action's preferred model and analysis source.
- Organize prompts by subject, scene, composition, lighting, and style. Local rules constrain AI results so visual attributes are not treated as categories and unsupported tags are not invented.
- Use **Organize** beside AI tags to merge synonyms, group unorganized tags, classify entities, and correct wrong groups with preview, confirmation, and undo.
- Export AI settings normally, with a password, or with account verification. Account-verified backups can only be imported after the same account is verified.

<img src="./photo/readme/ai-settings.png" alt="AI model and rule settings" width="100%" />

> AI endpoints and API keys are user-provided. Browsing, editing, local lexicons, import, and export remain available without an AI configuration.

### Creative canvas

- Edit prompts and call configured image / video models inside the app.
- Fit generated artwork to the available canvas area; copy, favorite, export, regenerate, or add results to the local library.
- Collapse and restore the parameter panel. Canvas backgrounds can follow the theme, use the classic white style, or use a custom color or image.
- Generation mode adds scanning, energy-field, particle, and completion effects while the idle canvas stays restrained.
- Use reference images, clipboard paste, quick model switching, and structured generation errors.

<img src="./photo/readme/canvas.png" alt="Creative canvas" width="100%" />

### Ideas and tasks

- Save text-only prompts, workflows, configuration notes, and GitHub project notes without needing an artwork file.
- Rich text, variables, categories, tags, favorites, drag sorting, copy, import, and export are supported.
- Tasks support projects, subtasks, priority, progress, tags, archives, and quick creation.
- The monthly calendar supports single-day-off, alternate-week, and two-day-off schedules. Workdays, rest days, holidays, and make-up workdays can be queried and adjusted manually.
- Export all tasks or only selected tasks.

<img src="./photo/readme/ideas.png" alt="Ideas library" width="100%" />

<img src="./photo/readme/todo.png" alt="Task center" width="100%" />

### Accounts and authorship

- Uses real OIDC Authorization Code + PKCE authorization through [Guli Identity](https://auth.guliacer.dpdns.org).
- Email registration / sign-in, Google, GitHub, Linux.do, and device-code flows complete in the system default browser. SuYan never receives provider passwords or a `client_secret`.
- Link multiple sign-in methods. After authorization, confirm whether to use the current or new account's name and avatar, or enter custom profile details.
- New generated or imported works can record the signed-in account. Older local works are not automatically synced; detail and batch views provide explicit sync actions with confirmation before replacing existing authorship.
- Local linked works follow a new avatar after the account profile changes; share packages can retain author information.
- Tokens are protected by the operating system secure store in the Electron main process.

### ComfyUI, web assistant, and resources

- A local receiver listens on `127.0.0.1:9477` and accepts images, prompts, negative prompts, titles, and generation methods from ComfyUI.
- ComfyUI PNG prompt / workflow metadata is parsed automatically and uses the same local import path.
- The web assistant provides a controlled web workspace and site directory for common creative websites.
- Resource recommendations focus on maintained model, tool, prompt, and creative-resource links; expired entries are removed or updated.

### Content rating and optional components

- Local NSFW rating, default blur, temporary reveal in detail, and batch re-rating are supported.
- FFmpeg and the local NSFW runtime are optional components. Fixed download locations, signed manifests, and file hashes are verified before installation.
- The app does not package personal media, accounts, settings, or logs.

### Appearance, language, and guidance

- Translucent glass title bar and sidebar, with independent accent, secondary, tertiary, navigation, background, and workspace colors.
- Canvas backgrounds, sidebar entries, layout, and always-on-top state persist locally.
- Simplified Chinese is the default UI language; switch to English in System Settings. User prompts, tags, categories, and material content are not automatically translated.
- First-use guidance covers each page's real controls, including import methods, prompt cards, canvas parameters, AI connections, system settings, and window controls.
- Check official GitHub releases and choose update now, remind later, ignore this version, or never remind.

<img src="./photo/readme/system-settings.png" alt="System settings" width="100%" />

## Quick start

### Use a release build

Download the available installer or portable build from [GitHub Releases](https://github.com/guliacer/SuYan/releases). The current release is `v0.3.6`; the latest version is always shown on the Releases page.

If GitHub downloads are slow, mirror downloads are also available:

- [Quark Drive](https://pan.quark.cn/s/5d22e38ac71a)
- [Baidu Netdisk](https://pan.baidu.com/s/1clGqo2sebMwzt3WhwESWQA), extraction code: `bf8y`

Choose the installer or portable file matching the required edition, then use the included `SHA256SUMS.txt` to verify the download.

Run the installer and choose a directory, or extract the portable build to a writable folder and run `素言.exe`. The first launch creates `data\` and `logs\` beside the app.

### Develop locally

Requirements: Windows 10 / 11, Node.js, and pnpm 11.9.0.

```powershell
pnpm install
pnpm dev
```

Useful checks:

```powershell
pnpm typecheck
pnpm test
pnpm check:secrets
pnpm check:empty-shell
pnpm check:release-notes
```

Build the development Windows portable directory:

```powershell
pnpm package:win
```

Build installer and portable release artifacts:

```powershell
pnpm package:win:release
```

Release artifacts must not include `data\`, `logs\`, API keys, account credentials, personal media, or private configuration. See [docs/Windows四版本打包.md](./docs/Windows四版本打包.md) for optional-component editions.

Before pushing or creating a GitHub Release, `pnpm check:release-notes` must pass. Once the Release exists, also run `pnpm check:release-notes:remote` to confirm that the Chinese / English description matches the remote body.

## Data and privacy

- Managed materials live under `data\library\`; logs live under `logs\`. External materials keep only relative indexes under registered roots.
- API keys and account tokens are not written to the README, installer, or logs. Logs are sanitized and do not contain full prompts, image bytes, or credentials.
- The library, ideas, tasks, lexicons, and settings are local by default. Sign-in is not cloud sync and does not upload older local work.
- Before upgrading or uninstalling, exit the app and copy the entire `data\` folder outside the app directory. A share ZIP contains selected works, not a complete backup.

## Changelog

### v0.3.6 (current release)

Compared with the latest public `v0.2.10`, this release line adds:

- Real Guli Identity browser authorization, email registration, Google / GitHub / Linux.do sign-in, device codes, and multiple linked methods.
- Account profile confirmation and custom name / avatar, authorship, batch work association, and account-verified exports.
- Ideas library, task calendar, work schedules, holiday lookup, and task exchange.
- ComfyUI receiver, web assistant, local NSFW rating, optional signed components, localized UI, update notifications, and page-by-page guidance.
- Canvas fitting and themed backgrounds, model-ID discovery, persistent per-action AI preferences, stricter category / tag organization, clipboard image fixes, thumbnail fallback, non-blocking export progress, folder memory, and release safety checks.

### v0.2.10

- Added mounted material folders, built-in canvas generation, configurable analysis sources, prompt-site adapters, and resource recommendations.
- Improved sharing, data placement, menus, drag grouping, native dialogs, category / tag analysis, AI error feedback, and layout.

## FAQ

<details>
<summary><b>Is SuYan paid?</b></summary>

No. It is MIT licensed and free to use. Download from [GitHub Releases](https://github.com/guliacer/SuYan); report paid installers or activation services via [Issues](https://github.com/guliacer/SuYan/issues).

</details>

<details>
<summary><b>Can I use it without AI?</b></summary>

Yes. Browsing, search, editing, copying, favorites, import / export, lexicons, and tasks work locally. AI analysis, online generation, web parsing, and some web features need network access or configured services.

</details>

<details>
<summary><b>Does sign-in automatically sync older work?</b></summary>

No. Older local works stay local. New work can be associated after explicit confirmation, and replacing existing authorship requires another confirmation.

</details>

<details>
<summary><b>Why does third-party sign-in open the browser?</b></summary>

That is the real OIDC authorization flow. SuYan starts a PKCE request and does not collect Google, GitHub, or Linux.do passwords. The browser returns to the app through `suyan://oauth/callback`.

</details>

<details>
<summary><b>How do I back up before an upgrade?</b></summary>

Exit the app and copy the entire `data\` folder outside the app directory. A share package is for exchanging selected works and is not a full backup.

</details>

<details>
<summary><b>How should I report a problem?</b></summary>

Use **Export Logs** in the app, then open a [GitHub Issue](https://github.com/guliacer/SuYan/issues) with the reproduction steps, expected result, actual result, and app version. Review exported attachments before sharing them.

</details>

## Contributing and license

Bug reports, feature ideas, and UX feedback are welcome. Include the version, operating system, reproduction steps, expected result, and actual result when possible.

SuYan is released under the [MIT License](./LICENSE). It uses open-source projects including Electron, React, Vite, TypeScript, Zustand, Lucide, JSZip, Sharp, Chokidar, openid-client, Vitest, and electron-builder. Exact versions and licenses are tracked in [package.json](./package.json) and [pnpm-lock.yaml](./pnpm-lock.yaml).

<div align="center">

**Made with ❤️ by SuYan 素言**

</div>
