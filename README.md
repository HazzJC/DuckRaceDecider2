# Duck Race Decider

A League-of-Legends-flavoured 3D duck race that turns "what do we do tonight" or "who's on which team" into an event. Type the names, pick a mode, and watch rubber ducks race down Summoner's River with two duck shoutcasters, river objectives and an instant replay. The finish order splits everyone into Blue and Red side.

**Live demo:** https://hazzjc.github.io/DuckRaceDecider2/ (the original 1.0 is still at https://hazzjc.github.io/DuckRaceDecider/)

## What's in 2.0

- **3D river arena** (Three.js): planar water reflections, wake foam, painterly terrain, wind-blown grass and trees, clouds, sun shafts, bloom and colour grading.
- **Rubber ducks** built on Poly Haven's CC0 *Rubber Duck Toy* scan, recoloured per player with patterns (dots, stripes, belly, bandit), hats and a turning head.
- **Champion-select lobby** with rendered duck portraits, plus a Hextech-style broadcast HUD: scorebar, standings, kill feed, announcer banners and minimap.
- **Shoutcasters**: Captain Drake (hype) and Professor Mallard (analyst), original parody characters. They react to every event in quack-speak with captions, live from a picture-in-picture desk.
- **River objectives** (Blind Pick and ARAM): turret gates, First Blood, the Dragon Drake's elemental buffs, Baron Goose's honk and steal, and a risky jungle shortcut.
- **Spells and items** (ARAM): ice and ignite projectiles, shields, bread, anchors and portals.
- **Replay**: deterministic seeded simulation, an auto-picked highlight reel, photo finishes, a 3D podium and a shareable results card.
- **Adaptive music** that builds with race tension, plus synthesised SFX. Separate Music, Effects and Casters volumes.

## Modes

- **Blind Pick**: objectives plus a late catch-up rubberband for ducks far behind.
- **Ranked**: pure race. No items, no objectives.
- **ARAM Mayhem**: everything on.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # sim determinism, fairness and team-split tests
npm run build    # static site in dist/ (relative base, GitHub Pages ready)
```

## Architecture

- `src/sim/`: pure, seeded, fixed-60Hz race simulation (no rendering). Replays re-run the same seed and cheer inputs.
- `src/render/`: stage and post-processing, water, world and nature, ducks, objectives, VFX, camera director, portraits.
- `src/casters/`: commentary engine, line bank, quack-speak synth, booth.
- `src/audio/`: mixer, SFX, adaptive music.
- `src/replay/`: highlight picking and the share card.
- `legacy/index.html`: the original 1.0 single-file version.

See [CREDITS.md](CREDITS.md) for asset credits. This is a fan-made parody and is not affiliated with Riot Games.
