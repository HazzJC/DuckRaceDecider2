# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-11-03

### Changed
- Ducks paddle much slower (shorter river, 15-60s races, default 30s) with a comical waddle, bob and the odd excited hop.
- Dragon Drake and Baron Goose are long-lived set pieces: the drake surfaces early, must be brawled for the kill (late arrivals can steal it), then escorts its owner and breathes on rivals. Baron honks repeatedly, must be brawled, and gives a parting honk.
- Music rewritten: hall reverb, strings, choir, taiko, brass, horn lead with bells, a bassoon lobby tune and a key lift for the final stretch.
- Caster quack-speak rebuilt as raspy, nasal quacks shaped to each syllable's vowel.
- UI scaled up for large screens with richer panels and LoL-style nameplates with progress bars.

### Added
- CC0 terrain textures and HDRI lighting, glossier rubber shading, and shadows on the water.
- Rebuilt caster desk: live aerial race feed on an LED wall, team banners, curved crest desk, laptops and mugs, studio key/rim lights. Casters wear studio headsets and hop, squash and lean in as they talk; the listener glances across.
- All chat is flamier and more League: [All]/[Team] channels, pings, flame/cope lines that name rivals, reactions to spells, steals, honks and the finish, and the odd mute.
- Sideline crowd ducks are matte with baked shading and receive shadows.

## [2.0.0] - 2026-11-03

### Changed
- Rebuilt as a Vite + TypeScript + Three.js app with a deterministic, seeded race simulation (the 1.0 page is kept in `legacy/`).

### Added
- 3D river arena with planar water reflections, wake foam, painterly terrain, grass, trees, clouds, sun shafts and colour grading.
- Rubber ducks based on Poly Haven's CC0 "Rubber Duck Toy", recoloured per player with patterns, hats and head animation.
- Hextech-style lobby with duck portraits, broadcast HUD, standings, kill feed and announcer banners.
- Duck shoutcasters with quack-speak captions and a picture-in-picture booth.
- River objectives: turret gates, First Blood, Dragon Drake buffs, Baron Goose and the jungle shortcut.
- Spell projectiles, magic sigils, turret lasers, light pillars and the Nexus finish.
- Highlight replay, photo finishes, 3D podium and a downloadable share card.
- Adaptive music and synthesised sound effects with per-bus volume.

## [1.0.0] - 2026-09-19

### Added
- **Animated Race Visualizer**: Single-page Canvas application turning group decisions into an animated duck race.
- **Three Race Modes**: Blind Pick (rubberband catch-up physics), Ranked (pure base speed rolls), and ARAM Mayhem (spells, portals, anchors, and bread powerups).
- **LoL-Themed Chat Panel**: In-game and post-game trash talk generator styled after League of Legends chat.
- **Live Tool**: Deployed on GitHub Pages at [hazzjc.github.io/DuckRaceDecider](https://hazzjc.github.io/DuckRaceDecider/).
