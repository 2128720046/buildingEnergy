/**
 * R3F JSX intrinsic element declarations for editor package type-checking.
 *
 * The viewer package already carries a similar fallback declaration, but the
 * editor package is type-checked independently, so it needs its own copy in
 * the local tsconfig include set.
 */

export {}

interface ThreeJSXElements {
  group: any
  scene: any
  boxGeometry: any
  planeGeometry: any
  circleGeometry: any
  cylinderGeometry: any
  sphereGeometry: any
  extrudeGeometry: any
  shapeGeometry: any
  bufferGeometry: any
  edgesGeometry: any
  ringGeometry: any
  mesh: any
  instancedMesh: any
  line: any
  lineSegments: any
  lineLoop: any
  points: any
  meshStandardMaterial: any
  meshBasicMaterial: any
  meshPhongMaterial: any
  meshLambertMaterial: any
  meshPhysicalMaterial: any
  meshNormalMaterial: any
  shadowMaterial: any
  lineBasicMaterial: any
  lineDashedMaterial: any
  pointsMaterial: any
  shaderMaterial: any
  rawShaderMaterial: any
  spriteMaterial: any
  lineBasicNodeMaterial: any
  meshBasicNodeMaterial: any
  ambientLight: any
  directionalLight: any
  pointLight: any
  spotLight: any
  hemisphereLight: any
  rectAreaLight: any
  perspectiveCamera: any
  orthographicCamera: any
  gridHelper: any
  axesHelper: any
  arrowHelper: any
  sprite: any
  lOD: any
  fog: any
  color: any
  bufferAttribute: any
  instancedBufferAttribute: any
  primitive: any
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeJSXElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeJSXElements {}
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeJSXElements {}
  }
}