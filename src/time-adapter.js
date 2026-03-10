import { MODULE_ID } from "./settings.js";

export class TimeAdapter {
    static updateSunFromTime(dayProgress, api) {
        const noonAltitude = game.settings.get(MODULE_ID, "altitude");
        const azimuth = (dayProgress * 360) % 360;

        // Sine wave arc: Peaks at 1.0 at Noon, drops into negative numbers at night
        const altitude = noonAltitude * Math.sin((dayProgress - 0.25) * 2 * Math.PI);

        api.setSunPosition(azimuth, altitude);
    }

    static init() {
        // Force an initial synchronisation check when the module loads
        this._syncTime();

        // Universal Core Hook (Covers SmallTime, Simple Calendar Reborn, and core Foundry time)
        Hooks.on("updateWorldTime", () => {
            this._syncTime();
        });
    }

    static _syncTime() {
        const api = game.modules.get(MODULE_ID)?.api;
        if (api?.getShadowConfig().timeIntegration !== "core") return;

        // Fetch the current world time from the native Foundry VTT API
        const worldTime = game.time.worldTime;
        const secondsInDay = 86400;

        // Step 1: Ensure pre-epoch negative world times always resolve to a positive time of day
        const timeOfDay = ((worldTime % secondsInDay) + secondsInDay) % secondsInDay;

        // Step 2: Calculate the percentage progression of the day
        const progress = timeOfDay / secondsInDay;

        this.updateSunFromTime(progress, api);
    }
}
