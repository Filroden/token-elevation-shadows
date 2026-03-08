# Dynamic Elevation Shadows

![Latest Version](https://img.shields.io/badge/Version-1.0.0-blue)
![Foundry Version](https://img.shields.io/badge/Foundry_VTT-v13_%7C_v13-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)
![System Agnostic](https://img.shields.io/badge/System-Agnostic-green)
![Download Count](https://img.shields.io/github/downloads/Filroden/dynamic-shadows/dynamic-shadows.zip)
![Download Count](https://img.shields.io/github/downloads/Filroden/dynamic-shadows/latest/dynamic-shadows.zip)
![Last Commit](https://img.shields.io/github/last-commit/Filroden/dynamic-shadows)
![Issues](https://img.shields.io/github/issues/Filroden/dynamic-shadows)

Dynamic Elevation Shadows is a lightweight, system-agnostic module that automatically generates 2.5D drop shadows for tokens based on their elevation. There is an optional game setting to only apply elevation shadows if the token has a specific status/active effect, e.g. `fly` applied.

It features a custom, high-performance PIXI shader that actively strips away the baked-in drop shadows often found on standard digital assets (such as the default shadows present on Forgotten Adventures tokens), ensuring a clean, dynamic silhouette at any height without requiring manual image editing.

## Solar Configuration

The module uses a trigonometric Altitude and Azimuth model to determine the length and direction of shadows. You can configure the global sun position in the module settings.

### Simulating Time of Day

- **Azimuth (Direction):** Represents the compass angle of the sun. Set to `90` for sunrise (East), `180` for midday (South), and `270` for sunset (West). Shadows are always cast away from the sun.
- **Altitude (Height):** Represents how high the sun is above the horizon, from `1` to `89`. Lower numbers simulate early morning or late evening, creating long, dramatic shadows. Higher numbers simulate midday, tightening the shadows closely beneath the tokens.

### Simulating Geographical Location

You can adjust the midday Altitude to reflect where your adventure takes place on the globe:

- **Equatorial Campaigns:** The midday sun is directly overhead. Set your midday Altitude to `85-89` for tight, intense shadows.
- **High Latitude Campaigns:** The sun never rises particularly high, even at noon. Limit your maximum midday Altitude to `40-50` to maintain longer shadows throughout the entire day cycle.

## API Reference

The module exposes a public API to allow macro writers and ecosystem modules (like calendar or time-tracking modules) to dynamically rotate the shadows as in-game time passes.

### Accessing the API

```javascript
const shadowAPI = game.modules.get("dynamic-shadows")?.api;
```

### Methods

- `getShadowConfig()`: Returns the current active configuration object, including cached trigonometric ratios.
- `setSunPosition(azimuth, altitude)`: Updates the global sun position and forces an immediate canvas redraw. This does not overwrite the GM's saved database settings, allowing for transient changes via macros.

### Example: Day Cycle Macro

This script simulates a full day-to-night cycle over 10 seconds, sweeping the sun from East to West while adjusting the shadow length.

```javascript
const shadowAPI = game.modules.get("dynamic-shadows")?.api;

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
