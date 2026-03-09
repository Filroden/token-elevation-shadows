# Version History

| Version | Changes |
| :--- | :--- |
| **Version 1.0.0** | **NEW FEATURES**<br>- Dynamic shadows that scale and physically offset along a vector as token elevation increases.<br>- High-performance PIXI shader to automatically strip baked-in shadows from top-down tokens.<br>- Global game settings for Sun Altitude and Azimuth to accurately simulate solar positioning.<br>- Game setting to only apply elevation shadows if named status/active effects are applied to the token, e.g., `fly`.<br>- Added a setting to synchronise shadow direction and length with the core world clock (fully compatible with SmallTime and Simple Calendar Reborn).<br>- Developer API (`setSunPosition`) allowing external time-tracking modules to dynamically control shadow direction and length. |
