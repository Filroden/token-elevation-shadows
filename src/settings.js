export const MODULE_ID = "token-elevation-shadows";

export function registerSettings(onChangeCallback) {
    const defaultSettings = {
        baseOpacity: {
            type: Number,
            value: 0.6,
            range: { min: 0.1, max: 1, step: 0.1 },
        },
        maxElevation: { type: Number, value: 100 },
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
        timeIntegration: {
            type: String,
            value: "none",
            choices: {
                none: "TokenElevationShadows.Setting.TimeIntegration.None",
                core: "TokenElevationShadows.Setting.TimeIntegration.Core",
            },
        },
    };

    for (const [key, config] of Object.entries(defaultSettings)) {
        const locKey = key.charAt(0).toUpperCase() + key.slice(1);

        game.settings.register(MODULE_ID, key, {
            name: `TokenElevationShadows.Setting.${locKey}.Name`,
            hint: `TokenElevationShadows.Setting.${locKey}.Hint`,
            scope: "world",
            config: true,
            type: config.type,
            choices: config.choices,
            range: config.range,
            default: config.value,
            onChange: () => onChangeCallback(),
        });
    }
}

export function getSettingsCache() {
    const rawStatuses = game.settings.get(MODULE_ID, "statusIds");
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
        timeIntegration: game.settings.get(MODULE_ID, "timeIntegration"),
    };
}
