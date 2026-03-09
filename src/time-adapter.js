import { MODULE_ID } from "./settings.js";

export class TimeAdapter {
    static updateSunFromTime(dayProgress, api) {
        const noonAltitude = game.settings.get(MODULE_ID, "altitude");
        const azimuth = (dayProgress * 360) % 360;

        // Sine wave arc: Peaks at 1.0 at Noon, drops into negative numbers at night
        const altitude =
            noonAltitude * Math.sin((dayProgress - 0.25) * 2 * Math.PI);

        api.setSunPosition(azimuth, altitude);
    }

    static init() {
        // Universal Core Hook (Covers SmallTime, Simple Calendar Reborn, and core Foundry time)
        Hooks.on("updateWorldTime", (worldTime) => {
            const api = game.modules.get(MODULE_ID)?.api;
            if (api?.getShadowConfig().timeIntegration !== "core") return;

            // Assuming a standard 24-hour day (86400 seconds)
            const timeOfDay = worldTime % 86400;
            const progress = timeOfDay / 86400;
            this.updateSunFromTime(progress, api);
        });
    }
}
