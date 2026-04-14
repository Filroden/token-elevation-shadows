import { registerSettings, getSettingsCache, MODULE_ID } from "./src/settings.js";
import { ShadowRenderer } from "./src/shadow.js";
import { TimeAdapter } from "./src/time-adapter.js";

let SHADOW_CONFIG = {};

function _calculateSolarOffsets(config) {
    // --- Flag if the sun has set ---
    config.isNight = config.altitude <= 0;

    // Clamp the trig math so it doesn't break or draw inverted shadows
    const safeAltitude = Math.max(1, Math.min(config.altitude, 89));
    const altitudeRad = safeAltitude * (Math.PI / 180);
    const azimuthRad = config.azimuth * (Math.PI / 180);

    config.sinAzimuth = Math.sin(azimuthRad);
    config.cosAzimuth = Math.cos(azimuthRad);
    config.tanAltitude = Math.tan(altitudeRad);

    return config;
}

Hooks.once("init", () => {
    registerSettings(() => {
        SHADOW_CONFIG = _calculateSolarOffsets(getSettingsCache());
        if (canvas.ready) {
            for (const token of canvas.tokens.placeables) {
                token.renderFlags.set({
                    refreshPosition: true,
                    refreshElevation: true,
                });
            }
        }
    });

    game.modules.get(MODULE_ID).api = {
        getShadowConfig: () => SHADOW_CONFIG,
        setSunPosition: (azimuth, altitude) => {
            SHADOW_CONFIG.azimuth = azimuth;
            SHADOW_CONFIG.altitude = altitude;
            SHADOW_CONFIG = _calculateSolarOffsets(SHADOW_CONFIG);

            if (canvas.ready) {
                for (const token of canvas.tokens.placeables) {
                    token.renderFlags.set({ refreshPosition: true });
                }
            }
        },
    };
});

Hooks.once("ready", () => {
    SHADOW_CONFIG = _calculateSolarOffsets(getSettingsCache());

    // Initialize the Time Adapter permanently
    TimeAdapter.init();
});

// Fires every time a scene is rendered, including mid-session switches
Hooks.on("canvasReady", () => {
    SHADOW_CONFIG = _calculateSolarOffsets(getSettingsCache());
    for (const token of canvas.tokens.placeables) {
        ShadowRenderer.update(token, SHADOW_CONFIG);
    }
});

// Hook fires immediately before the current canvas is dismantled
Hooks.on("canvasTearDown", () => {
    // Failsafe to ensure the tokens layer is accessible
    if (!canvas.tokens?.placeables) return;

    // Iterate through all tokens and trigger the cleanup method
    for (const token of canvas.tokens.placeables) {
        ShadowRenderer.clear(token);
    }
});

// --- Execution Hooks ---

Hooks.on("drawToken", (token) => {
    ShadowRenderer.update(token, SHADOW_CONFIG);
});

Hooks.on("refreshToken", (token) => {
    ShadowRenderer.update(token, SHADOW_CONFIG);
});

Hooks.on("destroyToken", (token) => {
    ShadowRenderer.clear(token);
});

// Debounce groups rapid executions into a single call after the specified delay (e.g., 150ms)
const debouncedShadowRefresh = foundry.utils.debounce(() => {
    if (canvas.ready) {
        for (const token of canvas.tokens.placeables) {
            ShadowRenderer.update(token, SHADOW_CONFIG);
        }
    }
}, 150);

// Reactively fade shadows when the GM changes the scene's global darkness slider
Hooks.on("lightingRefresh", debouncedShadowRefresh);
