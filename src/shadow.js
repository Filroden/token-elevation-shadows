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
    NATIVE_TOKEN_LAYER: 700,
};

/**
 * Custom PIXI Filter to strip out semi-transparent pixels and apply dynamic opacity.
 * Used to create clean shadow silhouettes by removing semi-transparent areas.
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
     * Validates token, calculates elevation, and creates/updates shadow sprite.
     *
     * @param {Token} token - The Foundry token object
     * @param {Object} config - Shadow configuration with solar positioning
     */
    static update(token, config) {
        if (!this._isValidForShadows(token, config)) {
            return;
        }

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
     * Checks for mesh existence, texture loading, and configuration validity.
     *
     * @param {Token} token - The Foundry token object
     * @param {Object} config - Shadow configuration object
     * @returns {boolean} True if token is valid for shadow rendering
     */
    static _isValidForShadows(token, config) {
        if (!token.mesh || Object.keys(config).length === 0) {
            return false;
        }

        // Ensure the texture is not empty and has resolved physical dimensions
        const tex = token.mesh.texture;
        if (!tex || tex === PIXI.Texture.EMPTY || tex.width === 0) {
            this._awaitAsyncTexture(token);
            return false;
        }

        return true;
    }

    /**
     * Dedicated helper to handle V14 asynchronous texture loading.
     */
    static _awaitAsyncTexture(token) {
        const src = token.document.texture?.src;
        if (!src || token._waitingForShadowTexture) return;

        token._waitingForShadowTexture = true;

        // Tap into Foundry's core loader to await the specific asset
        loadTexture(src)
            .then(() => {
                token._waitingForShadowTexture = false;

                // Do not manually execute the update outside the render loop.
                // Force Foundry to natively map the texture, which will safely trigger
                // the refreshToken hook during the next valid frame cycle.
                if (!token.destroyed) {
                    token.renderFlags.set({
                        refreshMesh: true,
                        refreshPosition: true,
                        refreshElevation: true,
                    });
                }
            })
            .catch(() => {
                token._waitingForShadowTexture = false;
            });
    }

    /**
     * Determines if the token is currently inside a bounded V14 Scene Region (an interior).
     * Used to calculate indoor vs outdoor shadow characteristics.
     *
     * @param {Token} token - The Foundry token object
     * @returns {boolean} True if token is inside an interior region
     */
    static _isIndoor(token) {
        if (!canvas.regions?.placeables) return false;

        const tokenCenter = token.center;
        const tokenElevation = token.document.elevation;

        for (const region of canvas.regions.placeables) {
            const bottomElevation = region.document.elevation.bottom ?? -Infinity;
            const topElevation = region.document.elevation.top ?? Infinity;

            // Scenario A: Underneath an overhead roof
            // If the region rests above the token, we test the token's 2D coordinates
            // against the region's lowest physical floor.
            if (bottomElevation > tokenElevation) {
                if (region.document.testPoint({ x: tokenCenter.x, y: tokenCenter.y, elevation: bottomElevation })) {
                    return true;
                }
            }

            // Scenario B: Inside a bounded interior
            // If the region physically encloses the token AND has a definitive ceiling.
            if (topElevation < Infinity && tokenElevation >= bottomElevation && tokenElevation <= topElevation) {
                if (region.document.testPoint({ x: tokenCenter.x, y: tokenCenter.y, elevation: tokenElevation })) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Determines the mathematical elevation, accounting for status requirements.
     * Ground-level tokens (elevation 0) don't cast shadows unless they have required airborne status.
     *
     * @param {Token} token - The Foundry token object
     * @param {Object} config - Shadow configuration object
     * @returns {number} Effective elevation value for shadow calculations
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
     * Applies alpha threshold filter to remove semi-transparent pixels from token texture.
     *
     * @param {Token} token - The Foundry token object
     * @param {Object} config - Shadow configuration object
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
     * Positions shadow sprite, applies scaling/blur effects, and handles elevation layering.
     *
     * @param {Token} token - The Foundry token object
     * @param {Object} config - Shadow configuration object
     * @param {number} elevation - Token's effective elevation
     * @param {number} centerX - Token center X coordinate
     * @param {number} centerY - Token center Y coordinate
     */
    static _mutateShadowState(token, config, elevation, centerX, centerY) {
        // Calculate the physical pixel offset based on elevation
        const elevationPixels = elevation * config.meshOffsetMultiplier;

        // Visually move the token art up the screen to restore the illusion of flight
        this._applyTokenVisualOffset(token, centerY, elevationPixels);

        const shadowSprite = token._elevationShadow;

        // Track previous sorting parameters to detect layer changes
        const prevElevation = shadowSprite.elevation;
        const prevSortLayer = shadowSprite.sortLayer;
        const prevZIndex = shadowSprite.zIndex;

        // Bind the shadow to the token's native elevation layer for proper sorting
        shadowSprite.elevation = token.document.elevation;
        shadowSprite.sortLayer = token.mesh.sortLayer ?? SHADOW_CONSTANTS.NATIVE_TOKEN_LAYER;
        shadowSprite.zIndex = (token.mesh.zIndex ?? 0) - 1;

        // Force the primary group to recalculate its buckets if shadow moved between elevation layers
        if (prevElevation !== shadowSprite.elevation || prevSortLayer !== shadowSprite.sortLayer || prevZIndex !== shadowSprite.zIndex) {
            canvas.primary.sortDirty = true;
        }

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
     * Isolates token visual positional mutation.
     */
    static _applyTokenVisualOffset(token, centerY, elevationPixels) {
        token.mesh.position.y = centerY - elevationPixels;
    }

    /**
     * Calculates shadow geometry parameters based on token elevation and environment.
     * Determines shadow length and blur amount for realistic shadow rendering.
     *
     * @param {Token} token - The Foundry token object
     * @param {number} elevation - Token's effective elevation
     * @param {number} elevationPixels - Elevation converted to pixel units
     * @param {number} heightRatio - Normalized elevation ratio (0-1)
     * @param {Object} config - Shadow configuration object
     * @returns {Object} Object containing shadowLength and blurAmount properties
     */
    static _calculateShadowGeometry(token, elevation, elevationPixels, heightRatio, config) {
        const isIndoor = this._isIndoor(token);

        // Indoor shadows are tighter and less affected by solar azimuth
        const shadowDampener = isIndoor ? 0.25 : 1;

        if (elevation === 0) {
            return {
                shadowLength: token.w * SHADOW_CONSTANTS.GROUNDED_SHADOW_RATIO,
                blurAmount: SHADOW_CONSTANTS.GROUNDED_BLUR,
            };
        }

        const totalHeight = SHADOW_CONSTANTS.BASE_TOKEN_HEIGHT + elevationPixels;

        return {
            shadowLength: (totalHeight / config.tanAltitude) * shadowDampener,
            blurAmount: SHADOW_CONSTANTS.ELEVATION_BLUR_BASE + heightRatio * SHADOW_CONSTANTS.ELEVATION_BLUR_MULTIPLIER,
        };
    }

    /**
     * Removes the elevation shadow from a token and cleans up associated resources.
     * Destroys filters and sprite, then removes references from token.
     *
     * @param {Token} token - The Foundry token object to clear shadow from
     */
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

    /**
     * Completely clears all shadow-related modifications from a token.
     * Removes both the elevation shadow and any alpha threshold filters applied to the token mesh.
     *
     * @param {Token} token - The Foundry token object to clear completely
     */
    static clear(token) {
        this.clearShadow(token);
        if (token.mesh?.filters && token._tokenAlphaFilter) {
            token.mesh.filters = token.mesh.filters.filter((f) => f !== token._tokenAlphaFilter);
            delete token._tokenAlphaFilter;
        }
    }

    /**
     * Creates a new elevation shadow sprite for a token.
     * Sets up the shadow with proper tinting, filters, and canvas integration.
     *
     * @param {Token} token - The Foundry token object to create shadow for
     * @param {Object} config - Shadow configuration object
     */
    static _createShadow(token, config) {
        const shadow = new PIXI.Sprite(token.mesh.texture);
        shadow.tint = 0x000000;

        const alphaFilter = new AlphaThresholdFilter(config.alphaThreshold);
        const blurFilter = new PIXI.BlurFilter();
        shadow.filters = [alphaFilter, blurFilter];

        // Pre-assign the sorting pillars before adding to the group.
        // This prevents the sprite from being permanently batched into the Background layer.
        shadow.elevation = token.document.elevation;
        shadow.sortLayer = token.mesh.sortLayer ?? 700; // 700 is the native Tokens layer
        shadow.zIndex = (token.mesh.zIndex ?? 0) - 1;

        canvas.primary.addChild(shadow);

        // Explicitly flag the primary group to re-sort its elevation buckets.
        canvas.primary.sortDirty = true;

        token._elevationShadow = shadow;
        token._shadowAlphaFilter = alphaFilter;
    }
}
