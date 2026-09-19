# Farm Hack Box — a peek inside

A small, self-contained static site: what a Farm Hack Box is, what it carries, and what it runs. Five pages that link to each other, with no server, build step or network calls needed. It works on GitHub Pages or opened straight from a checkout.

| # | Page | What it is | Source |
|---|------|------------|--------|
| 01 | `index.html` | The Farm Hack Box: the layers, the hardware, and the way into the rest | `dornawcox.github.io/Test-38/farm-hack-box-intro5.html` |
| 02 | `canon.html` | Canonical source texts, plus the **launch menu**: the tree figure with one hexagon for each tool the box runs | a live box, `/canon/` (canon v0.2.0) |
| 03 | `agroecology.html` | The ten FAO elements and what the box holds for each: orientation, one element (`#/1`–`#/10`) and the coverage matrix (`#/matrix`) | a live box, `/admin/#/agroecology` (admin release `44a0818`) |
| 04 | `cgo.html` | CGO — Community Governed Organizations: roles, protocols, tools and ceremonies, and what the box holds for each (`#/1`–`#/4`, `#/matrix`) | the CGO collateral card + live queries against a box, 2026-09-18 |
| 05 | `pos.html` | Farm Hack POS, the box's commerce layer | `dornawcox.github.io/ManagementSuiteV2/farm-hack-pos-draft-page-green.html` |
| 06 | `not-a-box-store.html` | The Open Box Network the box belongs to | `dornawcox.github.io/TalktotheInterviewer/not-a-box-store-v2.html` |

**`cgo-standalone.html`** is the same CGO page as a single self-contained file — stylesheets, script and artwork inlined, tour bar suppressed, no links to sibling pages. Drop it into any repo, or open it from a disk with nothing beside it.

## Publishing this on GitHub

The site is plain static files — no build step, no dependencies, nothing to install.

1. Create a repository (for example `farm-hack-box-peek`).
2. Upload the **contents** of this folder to the repository root, so that `index.html`
   sits at the top level rather than inside a subfolder. On github.com: *Add file →
   Upload files*, then drag in everything here, including the `assets` folder.
3. *Settings → Pages →* build from **main**, folder **/ (root)**, and save.

The site appears at `https://<org>.github.io/<repo>/` within a minute or two.
`.nojekyll` is included so that GitHub serves every file as-is.

To publish only the CGO page, upload `cgo-standalone.html` on its own — it needs no
other file — and link straight to it.

## How links behave

`assets/peek.js` adds the tour bar at the top of every page. It also handles every link that would only work on a running box:

- **A page in this set exists for it** (for example `/pos/` or `/admin/#/agroecology/4`): the link goes there.
- **The link only exists on a box** (for example `/admin/#/voice` or `/ghg/`): a dialog explains what the app is and what it does. For a tree cell, the dialog also shows the cell's state, role and FAO elements.
- **The link is a placeholder** (`#`, or the sponsor buttons): a "not live yet" dialog points to the community forum.

Links to outside sites (farmhack.org, fao.org and others) behave normally. Tree panels, tooltips, horizon bands, the full-size figure and the dialogs all work with a mouse, a keyboard or touch. On a phone, the first tap on a tree cell shows its panel and a second tap opens it.

## What was changed from the sources

- Embedded base64 images moved to `assets/img/`. Canon and agroecology data and figures are inlined, so nothing is fetched.
- The mangrove silhouette behind the tree figure (Noun Project #6416832) is kept. Its licence was unconfirmed on the box; the operator holds a **royalty-free licence**, and the embedded path is byte-identical to that licensed download (verified 2026-09-17), so the figure's caption now says so.
- **Removed:** on-box file paths, a private network hostname, and the internal notes carried in the agroecology data.
- Small responsive fixes (header navigation and the canon layout on phones), and a fix so taps on trunk cells don't land on the record-layer line.

## Attribution

- Ten Elements text: FAO, *10 Elements of Agroecology* (2015–2018), CC BY 4.0. Not affiliated with or endorsed by FAO.
- Element icons: Foodicons from The Lexicon (`fi:*`), plus Farm Hack Box additions (`fhb-*`). Confirm the Foodicons licence terms before redistributing.
- Mirabeau, *L'Ami des hommes* (1756), public domain.
- CGO card artwork: **Jenni**, created for the CGO collateral card and used here as intended. Shown as printed for SVN's Global Gathering 2026.
- Mangrove silhouette: **kareemovic2000**, The Noun Project #6416832, royalty-free licence held by the operator. Attribution is not required under that licence; it is given anyway, and the creator's name is not recorded in the file itself.
- The ground profile on the agroecology page is **as of July 2026**. Its own caveat applies: confirm organizational arrangements before citing it.
