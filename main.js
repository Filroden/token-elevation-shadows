import {
    registerSettings,
    getSettingsCache,
    MODULE_ID,
} from "./src/settings.js";

let SHADOW_CONFIG = {};

/**
 * Calculates and caches the trigonometric ratios for solar angles to save rendering performance.
 */
function _calculateSolarOffsets(config) {
    const safeAltitude = Math.max(1, Math.min(config.altitude, 89));
    const altitudeRad = safeAltitude * (Math.PI / 180);
    const azimuthRad = config.azimuth * (Math.PI / 180);

    // Cache the trig ratios instead of fixed pixel offsets
    config.sinAzimuth = Math.sin(azimuthRad);
    config.cosAzimuth = Math.cos(azimuthRad);
    config.tanAltitude = Math.tan(altitudeRad);

    return config;
}

Hooks.once("init", () => {
    registerSettings(() => {
        // Fetch settings, calculate offsets, and store in the global config
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
});

/**
 * Custom PIXI Filter to strip out semi-transparent pixels and apply dynamic opacity.
 */
class AlphaThresholdFilter extends PIXI.Filter {
    constructor(threshold = 0.2, globalOpacity = 1.0) {
        const fragmentShader = `
            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform float threshold;
            uniform float globalOpacity;
            void main(void) {
                vec4 color = texture2D(uSampler, vTextureCoord);
                // Discard pixels below the threshold
                if (color.a < threshold) {
                    gl_FragColor = vec4(0.0);
                } else {
                    // Apply our dynamic fade to the surviving pixels
                    gl_FragColor = color * globalOpacity;
                }
            }
        `;
        super(null, fragmentShader, { threshold, globalOpacity });
    }
}

Hooks.on("refreshToken", (token) => {
    if (!token.mesh || Object.keys(SHADOW_CONFIG).length === 0) return;

    const elevation = token.document.elevation;
    const centerY = token.y + token.h / 2;

    // STATUS GATE: Check if the token has ANY of the defined airborne statuses
    if (SHADOW_CONFIG.requireStatus) {
        const isAirborne = SHADOW_CONFIG.airborneStatuses.some((statusId) =>
            token.document.hasStatusEffect(statusId),
        );

        // If they are not airborne, physically ground the visual mesh
        if (!isAirborne) {
            elevation = 0;
        }
    }

    // 1. Negative Elevation: Remove everything and reset
    if (elevation < 0) {
        _removeShadow(token);
        token.mesh.position.y = centerY;
        return;
    }

    // 2. Initialise the shadow and token filters if they do not exist
    if (!token._elevationShadow) {
        _createShadow(token);
    }
    if (!token._tokenAlphaFilter) {
        token._tokenAlphaFilter = new AlphaThresholdFilter(
            SHADOW_CONFIG.alphaThreshold,
            1.0,
        );
    }

    // 3. Apply and update the Alpha Filter to the main token mesh
    if (!token.mesh.filters) token.mesh.filters = [];
    if (!token.mesh.filters.includes(token._tokenAlphaFilter)) {
        token.mesh.filters.push(token._tokenAlphaFilter);
    }
    token._tokenAlphaFilter.uniforms.threshold = SHADOW_CONFIG.alphaThreshold;
    token._tokenAlphaFilter.uniforms.globalOpacity = 1.0;

    // 4. Calculate dynamics
    const heightRatio = Math.min(elevation / SHADOW_CONFIG.maxElevation, 1);
    const elevationScale = Math.max(1 - heightRatio * 0.6, 0.2);
    const dynamicOpacity =
        SHADOW_CONFIG.baseOpacity - heightRatio * SHADOW_CONFIG.baseOpacity;
    const blurAmount = 4 + heightRatio * 15;

    // 5. Calculate Dynamic Shadow Position (The Physics Fix)
    // Give the token an intrinsic base height (e.g., 10 pixels) so it casts a small shadow at 0 elevation
    const baseTokenHeight = 10;
    const elevationPixels = elevation * SHADOW_CONFIG.meshOffsetMultiplier;
    const totalHeight = baseTokenHeight + elevationPixels;

    // Calculate how far the shadow is pushed based on the sun's altitude
    const shadowLength = totalHeight / SHADOW_CONFIG.tanAltitude;

    // Apply the azimuth direction to that length using our cached trig ratios
    const currentOffsetX = -shadowLength * SHADOW_CONFIG.sinAzimuth;
    const currentOffsetY = shadowLength * SHADOW_CONFIG.cosAzimuth;

    // 6. Update Shadow Filters
    if (token._shadowAlphaFilter) {
        token._shadowAlphaFilter.uniforms.threshold =
            SHADOW_CONFIG.alphaThreshold;
        token._shadowAlphaFilter.uniforms.globalOpacity = dynamicOpacity;
    }

    // 7. Synchronise geometry
    token._elevationShadow.texture = token.mesh.texture;
    token._elevationShadow.rotation = token.mesh.rotation;
    token._elevationShadow.anchor.copyFrom(token.mesh.anchor);

    // 8. Update visuals
    token._elevationShadow.scale.copyFrom(token.mesh.scale);
    token._elevationShadow.scale.x *= elevationScale;
    token._elevationShadow.scale.y *= elevationScale;
    token._elevationShadow.filters[1].blur = blurAmount;

    // 9. Update Position using the new dynamic offsets
    const centerX = token.x + token.w / 2;
    token._elevationShadow.position.set(
        centerX + currentOffsetX,
        centerY + currentOffsetY,
    );

    // 10. Visual Offset
    token.mesh.position.y = centerY - elevationPixels;
});

Hooks.on("destroyToken", (token) => {
    _removeShadow(token);
});

function _createShadow(token) {
    const shadow = new PIXI.Sprite(token.mesh.texture);
    shadow.tint = 0x000000;
    const alphaFilter = new AlphaThresholdFilter(SHADOW_CONFIG.alphaThreshold);
    const blurFilter = new PIXI.BlurFilter();
    shadow.filters = [alphaFilter, blurFilter];
    shadow.zIndex = -1;

    canvas.primary.addChild(shadow);
    token._elevationShadow = shadow;
    token._shadowAlphaFilter = alphaFilter;
}

function _removeShadow(token) {
    if (token._elevationShadow) {
        token._elevationShadow.destroy();
        delete token._elevationShadow;
        delete token._shadowAlphaFilter;
    }

    if (token.mesh && token.mesh.filters && token._tokenAlphaFilter) {
        token.mesh.filters = token.mesh.filters.filter(
            (f) => f !== token._tokenAlphaFilter,
        );
        delete token._tokenAlphaFilter;
    }
}
