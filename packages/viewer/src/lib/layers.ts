/** Default Three.js layer for main scene geometry. */
export const SCENE_LAYER = 0

/** Layer used for editor overlays (gizmos, handles, tool previews).
 *  Rendered in a separate pass so they bypass SSGI / AO / ink / outline. */
export const OVERLAY_LAYER = 1

/** Layer used for zone rendering (floor fills and wall borders). */
export const ZONE_LAYER = 2

/** Layer used for the editor ground grid. Kept in the scene pass so geometry
 *  depth-occludes it naturally. */
export const GRID_LAYER = 3
