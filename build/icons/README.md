# Sherpa UI — application icons (placeholder)

This directory contains **placeholder** application icons for the Electron build.
The PNG files (`icon-16.png` ... `icon-512.png`) are 1x1 transparent images intended
solely to make the electron-builder configuration valid for `--dir` (dry-run) mode
and tooling that probes for icon paths.

## What must be replaced before public release

Real, production-quality icons must replace these placeholders before any signed
public release. Required artifacts (T-L7-04 release workflow consumes them):

| Platform | File required                 | Notes                                                            |
|----------|-------------------------------|------------------------------------------------------------------|
| Windows  | `icon.ico`                    | multi-resolution ICO bundling 16/32/48/64/128/256 frames         |
| macOS    | `icon.icns`                   | Apple ICNS with 16/32/64/128/256/512/1024 retina-pair frames     |
| Linux    | `icon-{16,32,128,256,512}.png`| PNG set; AppImage/deb pick `icon-512.png` as primary            |

The current placeholder set covers the Linux case (PNG sizes only) and is **not**
sufficient for the macOS or Windows installer builds. T-L7-04 (release workflow)
or a manual artwork-import step must drop in `icon.ico` and `icon.icns` here.

## Generation

The placeholder PNGs were produced by `T-L7-01` with a 1x1 RGBA-transparent payload
(see commit history). Real icons should be exported from the official Sherpa brand
SVG (location TBD) at the resolutions above, with proper alpha + colour profile.

## Configuration

`electron-builder.yml` references this directory via:
- `directories.buildResources: build`
- `win.icon: build/icons/icon.ico`        (file does not yet exist — placeholder PR)
- `mac.icon: build/icons/icon.icns`       (file does not yet exist — placeholder PR)
- `linux.icon: build/icons`               (PNG directory — works with the placeholders)
