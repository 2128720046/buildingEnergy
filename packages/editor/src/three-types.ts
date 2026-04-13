/**
 * Runtime-visible R3F JSX augmentation bridge.
 *
 * 外部宿主在直接编译 workspace 源码时，不会自动把 editor 包里未被引用的 .d.ts
 * 文件纳入程序，因此这里保留一个真实的 side-effect 模块，供 editor 入口主动导入。
 */

import '@react-three/fiber'

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

declare global {
	namespace JSX {
		interface IntrinsicElements extends ThreeJSXElements {}
	}
}
