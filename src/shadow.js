// File: src/shadow.js

const SHADOW_CONSTANTS = {
    BASE_TOKEN_HEIGHT: 10,
    GROUNDED_SHADOW_RATIO: 0.05,
    GROUNDED_BLUR: 2,
    ELEVATION_BLUR_BASE: 4,
    ELEVATION_BLUR_MULTIPLIER: 15,
    MIN_ELEVATION_SCALE: 0.2,
    SCALE_REDUCTION_FACTOR: 0.6,
    Z_INDEX: -1,
    BASE_ELEVATION: 0,
};

/**
 * Custom PIXI Filter to strip out semi-transparent pixels and apply dynamic opacity.
 */
class AlphaThresholdFilter extends PIXI.Filter {
    constructor(threshold = 0.2, globalOpacity = 1) {
        const fragmentShader = `
            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;
            uniform float threshold;
            uniform float globalOpacity;
            void main(void) {
                vec4 color = texture2D(uSampler, vTextureCoord);
                if (color.a < threshold) {
                    gl_FragColor = vec4(0.0);
                } else {
                    gl_FragColor = color * globalOpacity;
                }
            }
        `;
        super(null, fragmentShader, { threshold, globalOpacity });
    }
}

export class ShadowRenderer {
    /**
     * Core update loop for managing token shadows.
     */
    static update(token, config) {
        if (!this._isValidForShadows(token, config)) return;

        const elevation = this._calculateEffectiveElevation(token, config);
        const centerY = token.y + token.h / 2;
        const centerX = token.x + token.w / 2;

        this._applyAlphaThresholdFilter(token, config);

        if (elevation < 0 || config.isNight) {
            this.clearShadow(token);
            return;
        }

        if (!token._elevationShadow) {
            this._createShadow(token, config);
        }

        this._mutateShadowState(token, config, elevation, centerX, centerY);
    }

    /**
     * Validates if the token should be processed for shadow rendering.
     */
    static _isValidForShadows(token, config) {
        if (!token.mesh || Object.keys(config).length === 0) return false;
        if (!token.mesh.texture || token.mesh.texture === PIXI.Texture.EMPTY) return false;
        return true;
    }

    /**
     * Determines the mathematical elevation, accounting for status requirements.
     */
    static _calculateEffectiveElevation(token, config) {
        let elevation = Math.max(0, token.document.elevation);

        if (config.requireStatus) {
            const isAirborne = config.airborneStatuses.some((statusId) => token.document.hasStatusEffect(statusId));
            if (!isAirborne) elevation = 0;
        }

        return elevation;
    }

    /**
     * Ensures the token's baked-in shadow is consistently stripped.
     */
    static _applyAlphaThresholdFilter(token, config) {
        if (!token._tokenAlphaFilter) {
            token._tokenAlphaFilter = new AlphaThresholdFilter(config.alphaThreshold, 1);
        }

        if (!token.mesh.filters) token.mesh.filters = [];

        if (!token.mesh.filters.includes(token._tokenAlphaFilter)) {
            token.mesh.filters.push(token._tokenAlphaFilter);
        }

        token._tokenAlphaFilter.uniforms.threshold = config.alphaThreshold;
        token._tokenAlphaFilter.uniforms.globalOpacity = 1;
    }

    /**
     * Mutates the spatial and visual state of the dynamic shadow.
     */
    static _mutateShadowState(token, config, elevation, centerX, centerY) {
        // 1. Calculate the physical pixel offset
        const elevationPixels = elevation * config.meshOffsetMultiplier;

        // Visually move the token art up the screen to restore the illusion of flight
        token.mesh.position.y = centerY - elevationPixels;

        const shadowSprite = token._elevationShadow;

        // Bind the shadow to the token's native elevation layer
        shadowSprite.elevation = token.document.elevation;
        shadowSprite.sortLayer = token.mesh.sortLayer;
        shadowSprite.zIndex = token.mesh.zIndex - 1;

        const heightRatio = Math.min(elevation / config.maxElevation, 1);
        const elevationScale = Math.max(1 - heightRatio * SHADOW_CONSTANTS.SCALE_REDUCTION_FACTOR, SHADOW_CONSTANTS.MIN_ELEVATION_SCALE);

        const darknessLevel = canvas.scene?.environment?.darknessLevel ?? canvas.scene?.darkness ?? 0;
        const ambientLightFactor = 1 - darknessLevel;
        const dynamicOpacity = (config.baseOpacity - heightRatio * config.baseOpacity) * ambientLightFactor;

        const { shadowLength, blurAmount } = this._calculateShadowGeometry(token, elevation, elevationPixels, heightRatio, config);

        const currentOffsetX = -shadowLength * config.sinAzimuth;
        const currentOffsetY = shadowLength * config.cosAzimuth;

        token._shadowAlphaFilter.uniforms.threshold = config.alphaThreshold;
        token._shadowAlphaFilter.uniforms.globalOpacity = dynamicOpacity;

        shadowSprite.texture = token.mesh.texture;
        shadowSprite.rotation = token.mesh.rotation;
        shadowSprite.anchor.copyFrom(token.mesh.anchor);

        shadowSprite.scale.copyFrom(token.mesh.scale);
        shadowSprite.scale.x *= elevationScale;
        shadowSprite.scale.y *= elevationScale;

        const blurFilter = shadowSprite.filters.find((f) => f instanceof PIXI.BlurFilter);
        if (blurFilter) blurFilter.blur = blurAmount;

        shadowSprite.position.set(centerX + currentOffsetX, centerY + currentOffsetY);
        shadowSprite.visible = !token.document.hidden;
    }

    /**
     * Isolates the mathematical calculations for shadow length and blur.
     */
    static _calculateShadowGeometry(token, elevation, elevationPixels, heightRatio, config) {
        if (elevation === 0) {
            return {
                shadowLength: token.w * SHADOW_CONSTANTS.GROUNDED_SHADOW_RATIO,
                blurAmount: SHADOW_CONSTANTS.GROUNDED_BLUR,
            };
        }

        const totalHeight = SHADOW_CONSTANTS.BASE_TOKEN_HEIGHT + elevationPixels;

        return {
            shadowLength: totalHeight / config.tanAltitude,
            blurAmount: SHADOW_CONSTANTS.ELEVATION_BLUR_BASE + heightRatio * SHADOW_CONSTANTS.ELEVATION_BLUR_MULTIPLIER,
        };
    }

    static clearShadow(token) {
        if (token._elevationShadow) {
            if (token._elevationShadow.filters) {
                for (const filter of token._elevationShadow.filters) {
                    filter.destroy();
                }
            }

            token._elevationShadow.destroy();
            delete token._elevationShadow;
            delete token._shadowAlphaFilter;
        }
    }

    static clear(token) {
        this.clearShadow(token);
        if (token.mesh?.filters && token._tokenAlphaFilter) {
            token.mesh.filters = token.mesh.filters.filter((f) => f !== token._tokenAlphaFilter);
            delete token._tokenAlphaFilter;
        }
    }

    static _createShadow(token, config) {
        const shadow = new PIXI.Sprite(token.mesh.texture);
        shadow.tint = 0x000000;

        const alphaFilter = new AlphaThresholdFilter(config.alphaThreshold);
        const blurFilter = new PIXI.BlurFilter();
        shadow.filters = [alphaFilter, blurFilter];

        canvas.primary.addChild(shadow);

        token._elevationShadow = shadow;
        token._shadowAlphaFilter = alphaFilter;
    }
}
