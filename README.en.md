<div align="center">

# SuYan 素言

[简体中文](./README.md) | **English**

**Local AI prompt & image library manager**

Keep your artwork and prompts together — find, edit, and take them anywhere

[GitHub](https://github.com/guliacer/SuYan) · [Highlights](#-highlights) · [Features](#-features) · [Quick start](#-quick-start) · [FAQ](#-faq) · [Paid listings](#-paid-listings)

**Forever free · Open source · Report paid resellers via [Issues](https://github.com/guliacer/SuYan/issues)**

<br/>

<img src="./photo/界面展示.gif" alt="SuYan overview" width="860" />

<p><sub>
<strong>Main window at a glance:</strong> left nav for library, import, lexicons, and settings; center masonry cards bind artwork with prompt summaries.
Adjust columns, search titles or prompts, filter by category / tag / favorites, sort by time, size, or random.
Open a card to edit, copy, or share.
</sub></p>

</div>

> 💚 **SuYan is always free.**  
> MIT-licensed open source — no app fees, no paid unlock, no membership.  
> If someone sells the installer or charges an “install fee”, **report it**, do not pay, and download from [GitHub](https://github.com/guliacer/SuYan).  
> Send links, screenshots, or shop names via [Issues](https://github.com/guliacer/SuYan/issues). Verified cases appear in [Paid listings](#-paid-listings).

---

## ✨ Highlights

> **SuYan** keeps artwork, positive/negative prompts, categories, tags, and replaceable terms in one local library — searchable, reusable, and easy to share.

- 🗂️ **Local first** — data stays on your machine; no cloud account required
- 🖼️ **Image + prompt together** — browse, edit, copy, and share in one flow
- ✨ **AI when you need it** — split parameters, expand terms, reverse-prompt, translate, optimize; works offline without AI
- 🧹 **Easy cleanup** — compress, dedupe, batch import/export

---

## 🚀 Features

Browse in everyday order. Each section lists capabilities, then shows a demo GIF.

### 🏠 Library browse

- **Masonry gallery** — card view for image / video prompts; column count adjustable
- **Full-text search** — title, filename, prompt text, or tags
- **Filter & sort** — category, tag, favorites; by import / modified time, size, or random
- **Favorites** — star items and view them alone

<img src="./photo/界面展示.gif" alt="Library browse" width="860" />

---

### 📥 Import

- **Import images** — batch add local files
- **Mount folders** — index existing image / video folders without copying the source media
- **Paste** — clipboard images go straight in
- **Import documents** — extract images and prompts from Word
- **Import shares** — ZIP packages or shared web links

#### Local import

Left sidebar **Import** → **Import images**, multi-select local files; paste and Word import also work.

Mounted folders can be watched individually from **Material folders**; watching is off by default. While enabled, new media is indexed automatically, removals are marked missing without deleting either the index or source files, and uniquely identifiable renames update the stored relative path. Turning watching off stops automatic synchronization.

<img src="./photo/本地素材导入.gif" alt="Local import" width="860" />

#### Network import

Paste a share link; SuYan downloads remote images and prompts. Configure **Network proxy** first if the site needs it.

<img src="./photo/网络素材导入.gif" alt="Network import" width="860" />

#### Share package

Export a ZIP (images + prompts) from detail or **Batch manage**; the other side uses **Import share** — no account required.

<img src="./photo/分享与导入.gif" alt="Share and import" width="860" />

---

### 🗂️ Batch manage

- **Unified list** — group counts and tag overview
- **Batch export / import** — export selected groups or import packages
- **Batch delete** — multi-select with confirmation
- **Image compress** — original format or WebP; quality adjustable
- **Video compress** — choose target resolution
- **Dedupe** — scan duplicates, keep one copy

<img src="./photo/去重-压缩.gif" alt="Dedupe and compress" width="860" />

---

### 📝 Prompt detail

- **Side-by-side** — artwork with positive / negative prompts
- **Copy / share** — clipboard or share package
- **Category & tags** — manual or AI suggestions
- **Model notes** — record how it was generated
- **Multi-image** — several artworks per prompt group

Open any masonry card to enter detail.

---

### ✨ AI assistant

- **Parameter analysis** — long prompts become clickable capsules
- **AI terms** — similar replaceable candidates for the current parameter
- **Prompt polish** — restructure by rules for better control
- **EN / ZH translate** — keep parameter structure where possible
- **Image reverse prompt** — generate a full prompt from artwork
- **Rule presets** — different providers / models / rules per action; right-click to switch

<img src="./photo/AI分析操作指引.gif" alt="AI analysis" width="860" />

> Configure an API under **Model settings** first. Local browse and edit work without AI.

---

### 🎬 Video prompts

- **Video cards** — cover and duration
- **Keyframe timeline** — one-click keyframes for pacing review
- **References** — import reference images / audio from file, clipboard, or link

---

### 📚 Lexicons

- **Categories** — groups, notes, cover images
- **Tags** — consistent naming for search
- **Parameter lexicon** — parameters, variables, defaults; import / export

<img src="./photo/分类-标签-参数页面.gif" alt="Lexicons" width="860" />

---

### 🌐 Resource links

- **Site shortcuts** — Jimeng, Civitai, LibLib, and more
- **Copy URL** — open in your browser

---

### ⚙️ Settings

- **Model settings** — multiple APIs, models, keys; per-action rules
- **Content rating** — auto NSFW, default blur, batch regrade, speed control
- **Network proxy** — system / manual / direct; auto-detect
- **Startup acceleration** — hardware acceleration (restart required)
- **Startup gallery** — custom splash carousel
- **Appearance** — light / dark theme

#### Model settings

Keys stay on your machine and are encrypted; they are never baked into the installer or repo.

<img src="./photo/API模型设置.gif" alt="API model settings" width="860" />

#### NSFW rating

Sensitive cards blur in the masonry by default; temporary reveal in detail; batch regrade supported.

<img src="./photo/NSFW分级.gif" alt="NSFW rating" width="860" />

#### Startup gallery

Six default splash images ship with the app; replace them with your own for next launch.

<img src="./photo/启动图库.gif" alt="Startup gallery" width="860" />

---

## 📥 Quick start

### Requirements

| Item | Requirement |
|------|-------------|
| OS | Windows 10 / 11 (64-bit) |
| Disk | Enough space for your images / videos |
| Network | Optional; needed for AI and share-link parsing |

### Install

1. **Download** the latest installer from [GitHub Releases](https://github.com/guliacer/SuYan/releases) (e.g. `SuYan-Setup-x.y.z.exe`), or portable ZIP then run `素言.exe`  
   (Free software. First release is `v0.1.0`; later versions ship separately and do not overwrite older assets. Report paid resellers via [Issues](https://github.com/guliacer/SuYan/issues).)
2. **Install or open** via the wizard, or run the portable build
3. **Import** images, paste, documents, or share packages from the left sidebar  
   (see [Local import](#local-import) / [Network import](#network-import))
4. **Organize** in the masonry; open detail to edit prompts; configure AI when ready  
   (see [AI assistant](#-ai-assistant) / [Model settings](#model-settings))

---

## ❓ FAQ

<details>
<summary><b>Is SuYan paid? What if someone sells the installer?</b></summary>

**A:** No. MIT open source, always free — no paid unlock or membership.  
If someone sells packages or charges install fees, **report it**, do not pay; download from [GitHub Releases](https://github.com/guliacer/SuYan/releases).  
Send evidence to [Issues](https://github.com/guliacer/SuYan/issues). Verified cases go to [Paid listings](#-paid-listings).

</details>

<details>
<summary><b>Where is my library? Is it uploaded?</b></summary>

**A:** On your machine by default. Browse and edit offline. Network is used only when you call remote AI, parse share links, or download remote images.

</details>

<details>
<summary><b>How do I configure AI?</b></summary>

**A:** Open **Model settings**, add endpoint, model, and API key. Right-click AI actions in detail to switch provider / model / rules. See [Model settings](#model-settings).

</details>

<details>
<summary><b>Share link parsing failed?</b></summary>

**A:** Check the network. If the site needs a proxy, enable or enter one under **Network proxy**, or try auto-detect.

</details>

<details>
<summary><b>How do I share with others?</b></summary>

**A:** Use **Share** in detail, or export selected groups in **Batch manage**. See [Share package](#share-package).

</details>

<details>
<summary><b>How is NSFW handled?</b></summary>

**A:** Enable auto rating and default blur under **Content rating**. Temporary reveal in detail; batch regrade supported. See [NSFW rating](#nsfw-rating).

</details>

<details>
<summary><b>Video features unavailable?</b></summary>

**A:** Video cards, keyframes, and video compress need video support. Confirm it is enabled; reinstall or update if needed.

</details>

---

## 🚨 Paid listings

SuYan is **forever free**. Channels below were reported and verified — **do not buy or download there**.

### How to report

1. Open a new [GitHub Issue](https://github.com/guliacer/SuYan/issues)
2. Include **link / shop name / screenshot / how they charge** when possible
3. Verified entries are listed here

> Official downloads: [GitHub Releases](https://github.com/guliacer/SuYan/releases) only. Absence from this list does not mean a third-party channel is safe.

### Verified list

| Channel / shop | Behavior | Reported | Notes |
|----------------|----------|----------|-------|
| (none yet) | — | — | Will update after verification |

---

## 🤝 Contributing

Feature ideas, UX feedback, and bug reports are welcome.

Please include when possible:

1. What you wanted to do
2. What happened vs what you expected
3. Repro steps (if any)

---

## Disclaimer

This project is open source under the [MIT License](./LICENSE), **forever free**, for learning and personal creative organization. Follow applicable laws; use AI-generated content responsibly. You assume the risk of use.

If SuYan helps you, a ⭐ or a share with friends is appreciated.

### Buy me a coffee ~

The app is free. Optional tips keep development going (no effect on features):

<div align="center">

<table>
  <tr>
    <td align="center" width="280">
      <img src="./photo/赞助-微信.png" alt="WeChat tip" width="180" />
      <br/>
      <sub>WeChat</sub>
    </td>
    <td width="48"></td>
    <td align="center" width="280">
      <img src="./photo/赞助-支付宝.jpg" alt="Alipay tip" width="180" />
      <br/>
      <sub>Alipay</sub>
    </td>
  </tr>
</table>

</div>

---

<div align="center">

**Made with ❤️ by SuYan 素言**

</div>
