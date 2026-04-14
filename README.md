# Token Elevation Shadows

![Latest Version](https://img.shields.io/badge/Version-2.0.0-blue)
![Foundry Version](https://img.shields.io/badge/Foundry_VTT-v13_%7C_v14-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)
![System Agnostic](https://img.shields.io/badge/System-Agnostic-green)
![Download Count](https://img.shields.io/github/downloads/Filroden/token-elevation-shadows/token-elevation-shadows.zip)
![Download Count](https://img.shields.io/github/downloads/Filroden/token-elevation-shadows/latest/token-elevation-shadows.zip)
![Last Commit](https://img.shields.io/github/last-commit/Filroden/token-elevation-shadows)
![Issues](https://img.shields.io/github/issues/Filroden/token-elevation-shadows)

**Token Elevation Shadows** is a lightweight, system-agnostic module that automatically generates 2.5D drop shadows for tokens based on their elevation. There is an optional game setting to only apply elevation shadows if the token has a specific status/active effect, e.g. `fly` applied.

It features a custom, high-performance PIXI shader that can strip away the baked-in drop shadows often found on standard digital assets. This ensures a clean, consistent silhouette whether a creature is walking on the ground or flying high above it, without requiring manual image editing.

Please install the correct version of the module:

v1.x is compatible with v13 of FoundryVTT.
v2.x is compatible with v14 of FoundryVTT.

## Solar Configuration

The module uses a trigonometric Altitude and Azimuth model to determine the length and direction of shadows. You can configure the global sun position in the module settings.

### Simulating Time of Day

- **Azimuth (Direction):** Represents the compass angle of the sun. Set to `90` for sunrise (East), `180` for midday (South), and `270` for sunset (West). Shadows are always cast away from the sun.
- **Altitude (Height):** Represents how high the sun is above the horizon, from `1` to `89`. Lower numbers simulate early morning or late evening, creating long, dramatic shadows. Higher numbers simulate midday, tightening the shadows closely beneath the tokens.

### Simulating Geographical Location

You can adjust the midday Altitude to reflect where your adventure takes place on the globe:

- **Equatorial Campaigns:** The midday sun is directly overhead. Set your midday Altitude to `85-89` for tight, intense shadows.
- **High Latitude Campaigns:** The sun never rises particularly high, even at noon. Limit your maximum midday Altitude to `40-50` to maintain longer shadows throughout the entire day cycle.

## Time Integration

Token Elevation Shadows features automation to synchronise your shadows with the in-game clock. When enabled, the sun will automatically sweep from East to West, stretching and shrinking shadows based on the time of day, and fading them out completely at night.

Go to the module settings and change **Time Integration** to **Core World Time**. This natively supports standard Foundry time progression, as well as popular modules that manipulate the core clock, including:

- **SmallTime**
- **Simple Calendar Reborn**

*(Note: For the automated day/night cycle to calculate correctly, ensure you have set a midday Altitude in your Solar Configuration settings).*

## Design Philosophy: The Canvas Illusion

Token Elevation Shadows is designed to create a 2.5D illusion of height without disrupting the strict 2D mechanical rules of Foundry VTT. To achieve this, the module deliberately separates the token's visual artwork from its logical footprint.

When a token takes flight, you will notice the following intentional design choices:

- **Tactical Clarity**: UI elements such as health bars, nameplates, status effect icons, and targeting reticles remain firmly planted on the ground. This provides a "tactical anchor," making sure players and GMs always know exactly which grid square a flying creature occupies for calculating ranges and placing area-of-effect templates.
- **Map Interaction**: The token's clickable hitbox stays on the ground. This prevents floating artwork from accidentally obstructing your ability to select other tokens standing behind the flying creature.
- **Vision & Lighting**: Light sources and vision cones continue to emit from the token's true footprint on the map. This guarantees that Line of Sight calculations remain mathematically accurate and fully compatible with wall and vision modules.
- **Ecosystem Compatibility**: Because the module exclusively elevates the token's artwork (the PIXI mesh), ground-based spell effects, auras, and most Sequencer animations attached to the token's bounding box will remain on the floor where they were cast.

## API Reference

The module exposes a public API to allow macro writers and ecosystem modules (like calendar or time-tracking modules) to dynamically rotate the shadows as in-game time passes.

### Accessing the API

```javascript
const shadowAPI = game.modules.get("token-elevation-shadows")?.api;
```

### Methods

- `getShadowConfig()`: Returns the current active configuration object, including cached trigonometric ratios.
- `setSunPosition(azimuth, altitude)`: Updates the global sun position and forces an immediate canvas redraw. This does not overwrite the GM's saved database settings, allowing for transient changes via macros.

### Example: Day Cycle Macro

This script simulates a full day-to-night cycle over 10 seconds, sweeping the sun from East to West while adjusting the shadow length.

```javascript
const shadowAPI = game.modules.get("token-elevation-shadows")?.api;

if (shadowAPI) {
    const totalFrames = 300; // 10 seconds at 30fps
    let currentFrame = 0;

    const sunLoop = setInterval(() => {
        currentFrame++;
        const progress = currentFrame / totalFrames;

        // Sweep from East (90) to West (270)
        const azimuth = 90 + (180 * progress);
        
        // Arc from low horizon (10) to high noon (85) and back down
        const altitude = 10 + (75 * Math.sin(progress * Math.PI));

        shadowAPI.setSunPosition(azimuth, altitude);

        if (currentFrame >= totalFrames) {
            clearInterval(sunLoop);
            shadowAPI.setSunPosition(180, 85); // Reset to noon
        }
    }, 33);
}
```
