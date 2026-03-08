export const MODULE_ID = "dynamic-shadows";

/**
 * Registers all module settings and attaches an onChange callback
 * to refresh the local cache and update the canvas immediately.
 */
export function registerSettings(onChangeCallback) {
    const defaultSettings = {
        baseOpacity: {
            type: Number,
            value: 0.6,
            range: { min: 0.1, max: 1, step: 0.1 },
        },
        maxElevation: { type: Number, value: 100 },
        // Replace offsets with Azimuth and Altitude
        azimuth: {
            type: Number,
            value: 180,
            range: { min: 0, max: 360, step: 1 },
        },
        altitude: {
            type: Number,
            value: 45,
            range: { min: 1, max: 89, step: 1 },
        },
        meshOffsetMultiplier: { type: Number, value: 2 },
        alphaThreshold: {
            type: Number,
            value: 0.2,
            range: { min: 0, max: 1, step: 0.05 },
        },
        requireStatus: { type: Boolean, value: false },
        statusIds: { type: String, value: "fly" },
    };

    for (const [key, config] of Object.entries(defaultSettings)) {
        // Capitalise the first letter for the localisation key mapping
        const locKey = key.charAt(0).toUpperCase() + key.slice(1);

        game.settings.register(MODULE_ID, key, {
            name: `DynamicShadows.Setting.${locKey}.Name`,
            hint: `DynamicShadows.Setting.${locKey}.Hint`,
            scope: "world",
            config: true,
            type: config.type,
            range: config.range,
            default: config.value,
            onChange: () => onChangeCallback(),
        });
    }
}

/**
 * Pulls all current settings from the database into a single object.
 */
export function getSettingsCache() {
    // Fetch the raw string
    const rawStatuses = game.settings.get(MODULE_ID, "statusIds");

    // Parse into a clean array: "fly, hover , levitate " -> ["fly", "hover", "levitate"]
    const statusArray = rawStatuses
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    return {
        baseOpacity: game.settings.get(MODULE_ID, "baseOpacity"),
        maxElevation: game.settings.get(MODULE_ID, "maxElevation"),
        azimuth: game.settings.get(MODULE_ID, "azimuth"),
        altitude: game.settings.get(MODULE_ID, "altitude"),
        meshOffsetMultiplier: game.settings.get(
            MODULE_ID,
            "meshOffsetMultiplier",
        ),
        alphaThreshold: game.settings.get(MODULE_ID, "alphaThreshold"),
        requireStatus: game.settings.get(MODULE_ID, "requireStatus"),
        airborneStatuses: statusArray,
    };
}
