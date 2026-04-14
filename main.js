import { registerSettings, getSettingsCache, MODULE_ID } from "./src/settings.js";
import { ShadowRenderer } from "./src/shadow.js";
import { TimeAdapter } from "./src/time-adapter.js";

const CONSTANTS = {
    RADIAN_MULTIPLIER: Math.PI / 180,
    DEBOUNCE_DELAY_MS: 150,
    SAFE_ALTITUDE_MIN: 1,
    SAFE_ALTITUDE_MAX: 89,
};

/**
 * Global configuration object for shadow rendering parameters.
 * Contains solar positioning, opacity settings, and integration preferences.
 */
let SHADOW_CONFIG = {};

/**
 * Flag to ensure TimeAdapter is only initialized once per session.
 * Prevents duplicate event listeners and redundant initialization.
 */
let timeAdapterInitialized = false;

/**
 * Safely retrieves settings cache with fallback defaults.
 * Used during early initialization when Foundry settings may not be fully registered.
 *
 * @returns {Object} Settings cache object with default values if settings unavailable
 */
function _getSettingsCache() {
    const settingKey = `${MODULE_ID}.statusIds`;
    if (!game.settings?.settings?.has(settingKey)) {
        return {
            baseOpacity: 0.6,
            maxElevation: 100,
            azimuth: 180,
            altitude: 45,
            meshOffsetMultiplier: 2,
            alphaThreshold: 0.2,
            requireStatus: false,
            airborneStatuses: ["fly"],
            timeIntegration: "none",
        };
    }
    return getSettingsCache();
}

/**
 * Calculates trigonometric values for solar positioning and determines day/night state.
 * Pre-computes sine/cosine values for performance and determines if shadows should render.
 *
 * @param {Object} config - Raw configuration object
 * @returns {Object} Enhanced config with calculated solar offsets and night flag
 */
function _calculateSolarOffsets(config) {
    // Determine if sun has set (altitude <= 0 means night)
    config.isNight = config.altitude <= 0;

    // Clamp altitude to safe trigonometric range (avoid division by zero)
    const safeAltitude = Math.max(CONSTANTS.SAFE_ALTITUDE_MIN, Math.min(config.altitude, CONSTANTS.SAFE_ALTITUDE_MAX));
    const altitudeRad = safeAltitude * CONSTANTS.RADIAN_MULTIPLIER;
    const azimuthRad = config.azimuth * CONSTANTS.RADIAN_MULTIPLIER;

    // Pre-compute trigonometric values for shadow calculations
    config.sinAzimuth = Math.sin(azimuthRad);
    config.cosAzimuth = Math.cos(azimuthRad);
    config.tanAltitude = Math.tan(altitudeRad);

    return config;
}

/**
 * Module initialization hook - runs once when Foundry loads the module.
 * Registers settings, sets up API, and prepares initial configuration.
 */
Hooks.once("init", () => {
    // Register module settings with change callback
    registerSettings(() => {
        SHADOW_CONFIG = _calculateSolarOffsets(_getSettingsCache());
        // Refresh existing tokens if canvas is ready
        if (canvas.ready) {
            for (const token of canvas.tokens.placeables) {
                token.renderFlags.set({
                    refreshPosition: true,
                    refreshElevation: true,
                });
            }
        }
    });

    // Initialize configuration with current settings
    SHADOW_CONFIG = _calculateSolarOffsets(_getSettingsCache());

    // Expose public API for other modules to interact with shadow system
    game.modules.get(MODULE_ID).api = {
        /**
         * Returns current shadow configuration
         * @returns {Object} Current shadow configuration object
         */
        getShadowConfig: () => SHADOW_CONFIG,

        /**
         * Manually sets sun position (used by time integration modules)
         * @param {number} azimuth - Sun azimuth in degrees (0-360)
         * @param {number} altitude - Sun altitude in degrees (-90 to 90)
         */
        setSunPosition: (azimuth, altitude) => {
            SHADOW_CONFIG.azimuth = azimuth;
            SHADOW_CONFIG.altitude = altitude;
            SHADOW_CONFIG = _calculateSolarOffsets(SHADOW_CONFIG);

            // Update all tokens with new solar positioning
            if (canvas.ready) {
                for (const token of canvas.tokens.placeables) {
                    token.renderFlags.set({ refreshPosition: true, refreshElevation: true });
                    ShadowRenderer.update(token, SHADOW_CONFIG);
                }
                // Force canvas to re-sort elevation layers
                if (canvas.primary) canvas.primary.sortDirty = true;
            }
        },
    };
});

/**
 * Game ready hook - runs once after all modules are initialized.
 * Ensures configuration is up-to-date before canvas rendering begins.
 */
Hooks.once("ready", () => {
    SHADOW_CONFIG = _calculateSolarOffsets(_getSettingsCache());
});

/**
 * Canvas ready hook - fires when scene canvas is fully loaded and ready for rendering.
 * Critical timing point: initializes time integration and creates initial shadows.
 * Runs on both world load and scene changes.
 */
Hooks.on("canvasReady", () => {
    const settings = _getSettingsCache();

    // Preserve time-synced solar position during scene changes to avoid flickering
    if (settings.timeIntegration === "core" && SHADOW_CONFIG.timeIntegration === "core") {
        const currentTimeConfig = {
            azimuth: SHADOW_CONFIG.azimuth,
            altitude: SHADOW_CONFIG.altitude,
        };
        SHADOW_CONFIG = _calculateSolarOffsets({ ...settings, ...currentTimeConfig });
    } else {
        SHADOW_CONFIG = _calculateSolarOffsets(settings);
    }

    // Initialize time integration after canvas is ready (prevents premature night-time sync)
    if (!timeAdapterInitialized) {
        TimeAdapter.init();
        timeAdapterInitialized = true;
    }

    // Defer shadow creation to next animation frame to ensure canvas is fully ready
    requestAnimationFrame(() => {
        for (const token of canvas.tokens.placeables) {
            ShadowRenderer.update(token, SHADOW_CONFIG);
        }

        // Force elevation layer re-sorting after shadow creation
        if (canvas.primary) {
            canvas.primary.sortDirty = true;
        }
    });
});

/**
 * Canvas teardown hook - fires when switching scenes or unloading canvas.
 * Cleans up all shadow sprites to prevent memory leaks and rendering artifacts.
 */
Hooks.on("canvasTearDown", () => {
    // Safely check for token layer existence
    if (!canvas.tokens?.placeables) return;

    // Clear shadows from all tokens
    for (const token of canvas.tokens.placeables) {
        ShadowRenderer.clear(token);
    }
});

// --- Token Lifecycle Hooks ---

/**
 * Token draw hook - fires when a token is first rendered on the canvas.
 * Creates initial shadow for new tokens.
 */
Hooks.on("drawToken", (token) => {
    ShadowRenderer.update(token, SHADOW_CONFIG);
});

/**
 * Token refresh hook - fires when token properties change (position, elevation, etc.).
 * Updates shadow positioning and appearance.
 */
Hooks.on("refreshToken", (token) => {
    ShadowRenderer.update(token, SHADOW_CONFIG);
});

/**
 * Token destroy hook - fires when a token is removed from the scene.
 * Cleans up associated shadow sprite.
 */
Hooks.on("destroyToken", (token) => {
    ShadowRenderer.clear(token);
});

// --- Environmental Hooks ---

/**
 * Lighting refresh hook - fires when scene lighting changes.
 * Updates shadow opacity based on ambient light levels.
 */
const debouncedShadowRefresh = foundry.utils.debounce(() => {
    if (canvas.ready) {
        for (const token of canvas.tokens.placeables) {
            ShadowRenderer.update(token, SHADOW_CONFIG);
        }
    }
}, CONSTANTS.DEBOUNCE_DELAY_MS);

Hooks.on("lightingRefresh", debouncedShadowRefresh);
