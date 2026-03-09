import {
    registerSettings,
    getSettingsCache,
    MODULE_ID,
} from "./src/settings.js";
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

// --- Execution Hooks ---

Hooks.on("refreshToken", (token) => {
    ShadowRenderer.update(token, SHADOW_CONFIG);
});

Hooks.on("destroyToken", (token) => {
    ShadowRenderer.clear(token);
});

// Reactively fade shadows when the GM changes the scene's global darkness slider
Hooks.on("lightingRefresh", () => {
    if (canvas.ready) {
        for (const token of canvas.tokens.placeables) {
            ShadowRenderer.update(token, SHADOW_CONFIG);
        }
    }
});
