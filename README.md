# Subnet / VLAN Planner

A browser-only IPv4 planning workspace. No account, database, API, telemetry, or backend. Calculations, imports, exports, and optional persistence run on your device.

## Open the App

Open [dist/index.html](dist/index.html) in a modern browser after building. This is a **single, self-contained HTML file** with JavaScript, CSS, fonts, and Lucide icons embedded. It works directly from disk, offline, without a server. The generated `dist` folder is ignored by Git.

The initial project includes example networks and VLANs; all fields are editable.

## First-Visit Tour

The welcome dialog appears on the first visit. **Start tour** walks through the calculator input, VLSM splitter, overlap checker, VLAN editor, and CSV export, switching tabs and highlighting each target. The tour never modifies your project data.

- Use **Back**, **Next**, and **Finish**, or the arrow keys, to navigate. **Skip**, the close button, and **Esc** dismiss the tour.
- Finishing or dismissing stores `tour_completed=true` in local storage, independently of **Save on this device**. It does not repeat on reload unless browser storage is cleared or unavailable.
- **Take the tour again** in the header reopens the welcome dialog at any time.
- **Load example** in the header restores the prefilled office network after confirmation. The confirmation includes **Back up current** so you can export your existing project before replacing it.
- Tooltips stay within the viewport, docking below the highlighted area on small screens. The modal keeps keyboard focus within the tour and returns it to the replay button on close.

If local storage is blocked, the tour still works and closes normally, but its dismissal cannot be remembered across reloads. The app shows a warning in that case.

## Development

Requires Node.js 20.19+ or 22.12+ and npm.

```sh
npm ci
npm test
npm run build
```

For live development:

```sh
npm run dev
```

Vite prints the local URL and chooses the next available port if its default port is busy. The development server serves static frontend assets only. To deploy, publish the generated HTML file to any static web host.

## Tools

| Tab | Functionality |
| --- | --- |
| Calculator | Live IPv4 calculations; automatic CIDR/mask conversion; network, broadcast, usable endpoints, usable and total address counts, wildcard, legacy class, scope, and binary address structure. Copy results or add the subnet to the overlap checker or VLAN table. |
| VLSM splitter | Named host requirements, largest-first allocation, normalized parent network, allocation visualization, host ranges, masks, broadcast addresses, utilization, and capacity errors. Send allocations to the overlap checker. |
| Overlaps | Editable named subnets, pairwise intersection detection, normalized networks, highlighted conflicts, exact shared address counts and ranges. Invalid entries are explicitly excluded. |
| VLAN table | Inline editing, search, active/inactive switches, deletion with undo, validation, overlap warnings, and spreadsheet-friendly CSV export. |

## Networking Rules

- IPv4 only. Addresses require four decimal octets from 0 to 255; ambiguous forms such as leading-zero octets are rejected.
- All prefixes from `/0` through `/32` are supported. Subnet masks must have contiguous network bits.
- Host bits in a CIDR are normalized for calculation, allocation, and overlap detection. VLAN inputs retain their entered notation, with a normalized-network hint when needed.
- For `/0` through `/30`, usable hosts exclude the network and broadcast addresses. `/31` uses RFC 3021 point-to-point semantics with two usable addresses; `/32` is a one-address host route. Neither has a broadcast address.
- VLSM uses **standard LAN sizing**: requested hosts plus network and broadcast, rounded up to a power of two, with a minimum `/30`. It does not generate `/31` or `/32` allocations.
- Overlap counts include every shared address, not only usable hosts. Containment and identical subnets count as conflicts; adjacent networks do not.
- Private means RFC 1918. Loopback, link-local, multicast, shared CGNAT, and other library-recognized special-use ranges are distinguished from public addresses. Scope and legacy class labels are not evidence of reachability or an authoritative routing policy.
- VLAN IDs must be unique integers in 1-4094. This planner reserves 1 and 1002-1005 as requested. Actual device restrictions can vary.
- Overlap checking includes inactive VLANs; an overlapping VLAN subnet is a warning, not an export-blocking error.

## Project Files and Privacy

**Export JSON** creates a versioned backup containing the project name, calculator inputs, VLSM requirements, overlap list, and VLAN table. Calculated results are recomputed on restore. Unfinished inputs are retained in JSON backups.

**Import project** validates the file before asking to replace the current project. The confirmation offers a backup action. Invalid JSON, unsupported versions, duplicate row keys, oversized collections, and files over 2 MB are rejected without replacing your work.

**Export CSV** exports all VLAN rows, regardless of the current search. It is blocked until row validation errors are resolved. CSV uses UTF-8 with a BOM, CRLF row separators, quoted fields, and escaped quotes. Formula-like text is prefixed with an apostrophe to reduce spreadsheet formula-injection risk. CSV import is not supported.

**Save on this device** is off by default. Enabling it saves edits to browser local storage; disabling it removes that saved session. A saved session loads automatically. Nothing is transmitted. Without local saving, reloads discard unexported changes.

Local storage is tied to the browser and origin; behavior for local `file:` URLs varies by browser. Moving the HTML file, private browsing, storage restrictions, clearing browser data, or storage quotas may prevent restoration. Keep JSON backups for portability. Clipboard copying also depends on browser permission and context.

Limits: 256 VLSM requirements, 256 overlap entries, 512 VLAN rows, 100-character project names, and 2,000-character text fields in imported projects.

## Verification

`npm test` runs Node's built-in test runner against the calculation and serialization modules. Coverage includes all 33 subnet masks, malformed addresses, unsigned address boundaries, `/0`, `/31`, `/32`, exact-fit and exhausted VLSM allocation, overlaps, reserved and duplicate VLAN IDs, JSON round trips, and CSV escaping.

The packaged HTML was also checked in Chromium for calculator conversion and errors, VLSM editing, overlap conflicts, VLAN editing and undo, CSV/JSON export content, import restoration and rejection, local persistence, keyboard tab navigation, and responsive layouts at desktop, tablet, and mobile widths. Other browser engines have not been separately verified.

Onboarding was checked for first-visit display, finish/skip persistence, replay, Back/Next and arrow navigation, Escape dismissal, focus restoration, preservation of edited inputs, example-loading confirmation, and blocked-storage handling. All five spotlight steps were checked at desktop, tablet, narrow mobile, and landscape sizes.

## Structure

- [src/network.js](src/network.js): IPv4 calculations and network validation, using `ipaddr.js` for address parsing and classification.
- [src/project.js](src/project.js): Zod project schema, sample data, and JSON/CSV serialization.
- [src/main.jsx](src/main.jsx): React interface and browser file/storage integration.
- [src/Tour.jsx](src/Tour.jsx): Lightweight native-dialog tour, step definitions, spotlight positioning, and keyboard navigation.
- [src/styles.css](src/styles.css): Responsive light theme, DM Sans / IBM Plex Mono typography, and semantic status colors.
- [tests/network.test.js](tests/network.test.js): Core regression tests.
- [vite.config.js](vite.config.js): Single-file production packaging.