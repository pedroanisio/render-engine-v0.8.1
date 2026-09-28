// Generated from the scene-render schema by scripts/codegen.js. Do not edit.
// Attribute sets after decoding: defaulted attributes are always present.

export interface ParamValueTypeAttributes {
  'name': string;
  'value': string;
}

export interface OverrideTypeAttributes {
  'target': string;
  'property': string;
  'value': string;
}

export interface KeyTypeAttributes {
  'time': number;
  'value': string;
  'interpolation'?: 'step' | 'hold' | 'steps' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'catmull-rom' | 'tcb' | 'spring' | 'sine-in' | 'sine-out' | 'sine-in-out' | 'quad-in' | 'quad-out' | 'quad-in-out' | 'cubic-in' | 'cubic-out' | 'cubic-in-out' | 'quart-in' | 'quart-out' | 'quart-in-out' | 'quint-in' | 'quint-out' | 'quint-in-out' | 'expo-in' | 'expo-out' | 'expo-in-out' | 'circ-in' | 'circ-out' | 'circ-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'elastic-in' | 'elastic-out' | 'elastic-in-out' | 'bounce-in' | 'bounce-out' | 'bounce-in-out';
  'bezier'?: string;
  'easeIn'?: string;
  'easeOut'?: string;
  'spatialIn'?: string;
  'spatialOut'?: string;
  'roving': boolean;
  'steps'?: number;
  'stepPosition': 'start' | 'end';
  'tension': number;
  'continuity': number;
  'bias': number;
  'stiffness': number;
  'damping': number;
  'mass': number;
  'marker'?: string;
}

export interface AnimateTypeAttributes {
  'property': string;
  'defaultInterpolation': 'step' | 'hold' | 'steps' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'catmull-rom' | 'tcb' | 'spring' | 'sine-in' | 'sine-out' | 'sine-in-out' | 'quad-in' | 'quad-out' | 'quad-in-out' | 'cubic-in' | 'cubic-out' | 'cubic-in-out' | 'quart-in' | 'quart-out' | 'quart-in-out' | 'quint-in' | 'quint-out' | 'quint-in-out' | 'expo-in' | 'expo-out' | 'expo-in-out' | 'circ-in' | 'circ-out' | 'circ-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'elastic-in' | 'elastic-out' | 'elastic-in-out' | 'bounce-in' | 'bounce-out' | 'bounce-in-out';
  'extrapolateBefore': 'hold' | 'linear' | 'loop' | 'ping-pong' | 'offset';
  'extrapolateAfter': 'hold' | 'linear' | 'loop' | 'ping-pong' | 'offset';
  'additive': boolean;
  'timeBase': 'composition' | 'local' | 'normalized';
}

export interface ExpressionTypeAttributes {
  'property': string;
  'seed'?: bigint;
  'enabled': boolean;
}

export interface MotionPathTypeAttributes {
  'path': string;
  'start': number;
  'end'?: number;
  'interpolation': 'step' | 'hold' | 'steps' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'catmull-rom' | 'tcb' | 'spring' | 'sine-in' | 'sine-out' | 'sine-in-out' | 'quad-in' | 'quad-out' | 'quad-in-out' | 'cubic-in' | 'cubic-out' | 'cubic-in-out' | 'quart-in' | 'quart-out' | 'quart-in-out' | 'quint-in' | 'quint-out' | 'quint-in-out' | 'expo-in' | 'expo-out' | 'expo-in-out' | 'circ-in' | 'circ-out' | 'circ-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'elastic-in' | 'elastic-out' | 'elastic-in-out' | 'bounce-in' | 'bounce-out' | 'bounce-in-out';
  'autoOrient': boolean;
  'orientOffset': number;
  'constantSpeed': boolean;
}

export interface LinkTypeAttributes {
  'property': string;
  'source': string;
  'scale': number;
  'offset': number;
  'min'?: number;
  'max'?: number;
  'delay': number;
  'smoothing': number;
}

export interface AnimatedTypeAttributes {}

export interface TimeRemapTypeAttributes {
  'defaultInterpolation': 'step' | 'hold' | 'steps' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'catmull-rom' | 'tcb' | 'spring' | 'sine-in' | 'sine-out' | 'sine-in-out' | 'quad-in' | 'quad-out' | 'quad-in-out' | 'cubic-in' | 'cubic-out' | 'cubic-in-out' | 'quart-in' | 'quart-out' | 'quart-in-out' | 'quint-in' | 'quint-out' | 'quint-in-out' | 'expo-in' | 'expo-out' | 'expo-in-out' | 'circ-in' | 'circ-out' | 'circ-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'elastic-in' | 'elastic-out' | 'elastic-in-out' | 'bounce-in' | 'bounce-out' | 'bounce-in-out';
  'frameBlend': 'none' | 'frame-mix' | 'optical-flow';
}

export interface MaskTypeAttributes {
  'type': 'rect' | 'ellipse' | 'rounded-rect' | 'path' | 'polygon' | 'star';
  'x': number | string;
  'y': number | string;
  'width'?: number | string;
  'height'?: number | string;
  'radius': number;
  'invert': boolean;
  'path'?: string;
  'points': number;
  'innerRadius'?: number;
  'fillRule': 'nonzero' | 'evenodd';
  'feather': number;
  'expansion': number;
  'opacity': number;
  'mode': 'intersect' | 'add' | 'subtract' | 'lighten' | 'darken' | 'difference' | 'none';
}

export interface TransformConstraintTypeAttributes {
  'type': 'parent' | 'look-at' | 'follow-path' | 'copy-position' | 'copy-rotation' | 'copy-scale' | 'copy-transform' | 'distance' | 'ik' | 'track';
  'target'?: string;
  'path'?: string;
  'point'?: string;
  'influence': number;
  'space': 'world' | 'local';
  'offsetX': number;
  'offsetY': number;
  'offsetRotation': number;
  'minDistance'?: number;
  'maxDistance'?: number;
  'bendPositive': boolean;
  'progress': number;
  'autoOrient': boolean;
}

export interface StopTypeAttributes {
  'offset': number;
  'color': string;
  'opacity': number;
  'midpoint': number;
}

export interface GradientBaseTypeAttributes {
  'id': string;
  'spread': 'pad' | 'reflect' | 'repeat';
  'units': 'object' | 'user';
  'interpolationSpace': 'linear' | 'srgb' | 'oklab' | 'oklch';
  'dither': boolean;
  'rotation': number;
}

export interface LinearGradientTypeAttributes {
  'id': string;
  'spread': 'pad' | 'reflect' | 'repeat';
  'units': 'object' | 'user';
  'interpolationSpace': 'linear' | 'srgb' | 'oklab' | 'oklch';
  'dither': boolean;
  'rotation': number;
  'x1': number;
  'y1': number;
  'x2': number;
  'y2': number;
}

export interface RadialGradientTypeAttributes {
  'id': string;
  'spread': 'pad' | 'reflect' | 'repeat';
  'units': 'object' | 'user';
  'interpolationSpace': 'linear' | 'srgb' | 'oklab' | 'oklch';
  'dither': boolean;
  'rotation': number;
  'cx': number;
  'cy': number;
  'r': number;
  'fx'?: number;
  'fy'?: number;
  'fr': number;
  'aspect': number;
}

export interface ConicGradientTypeAttributes {
  'id': string;
  'spread': 'pad' | 'reflect' | 'repeat';
  'units': 'object' | 'user';
  'interpolationSpace': 'linear' | 'srgb' | 'oklab' | 'oklch';
  'dither': boolean;
  'rotation': number;
  'cx': number;
  'cy': number;
  'angle': number;
}

export interface MeshPointTypeAttributes {
  'row': number;
  'col': number;
  'color': string;
  'x'?: number;
  'y'?: number;
}

export interface MeshGradientTypeAttributes {
  'id': string;
  'rows': number;
  'cols': number;
  'interpolationSpace': 'linear' | 'srgb' | 'oklab';
}

export interface PatternPaintTypeAttributes {
  'id': string;
  'asset': string;
  'tileWidth'?: number;
  'tileHeight'?: number;
  'offsetX': number;
  'offsetY': number;
  'rotation': number;
  'scale': number;
}

export interface PaintsTypeAttributes {}

export interface TokenTypeAttributes {
  'name': string;
  'value': string;
}

export interface TextStyleTypeAttributes {
  'id': string;
  'basedOn'?: string;
  'size'?: number;
  'color'?: string;
  'lineHeight'?: number;
  'font'?: string;
  'fontFile'?: string;
  'fontAsset'?: string;
  'fallback'?: string;
  'weight'?: number;
  'fontStyle'?: 'normal' | 'italic' | 'oblique';
  'stretch'?: number;
  'variation'?: string;
  'features'?: string;
  'strokeColor'?: string;
  'strokeWidth'?: number;
  'strokePosition'?: 'center' | 'inside' | 'outside';
  'shadowColor'?: string;
  'shadowOffsetX'?: number;
  'shadowOffsetY'?: number;
  'shadowBlur'?: number;
  'baselineShift'?: number;
  'tracking'?: number;
  'textTransform'?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
  'decoration'?: 'none' | 'underline' | 'line-through' | 'overline';
  'highlight'?: string;
}

export interface StylesTypeAttributes {}

export interface RepresentationTypeAttributes {
  'name': string;
  'src': string;
  'width'?: number;
  'height'?: number;
  'colorSpace'?: 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'transfer'?: 'auto' | 'srgb' | 'linear' | 'bt1886' | 'gamma22' | 'gamma26' | 'pq' | 'hlg' | 'slog3' | 'logc3' | 'logc4' | 'vlog' | 'clog3' | 'redlog3g10' | 'flog2' | 'nlog' | 'acescc' | 'acescct';
  'language'?: string;
  'sha256'?: string;
}

export interface ImageAssetTypeAttributes {
  'id': string;
  'src': string;
  'width': number;
  'height': number;
  'colorSpace': 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'transfer': 'auto' | 'srgb' | 'linear' | 'bt1886' | 'gamma22' | 'gamma26' | 'pq' | 'hlg' | 'slog3' | 'logc3' | 'logc4' | 'vlog' | 'clog3' | 'redlog3g10' | 'flog2' | 'nlog' | 'acescc' | 'acescct';
  'alpha': 'auto' | 'none' | 'straight' | 'premultiplied';
  'layer'?: string;
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface VideoAssetTypeAttributes {
  'id': string;
  'src': string;
  'width': number;
  'height': number;
  'fps': string;
  'duration': number;
  'colorSpace': 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'transfer': 'auto' | 'srgb' | 'linear' | 'bt1886' | 'gamma22' | 'gamma26' | 'pq' | 'hlg' | 'slog3' | 'logc3' | 'logc4' | 'vlog' | 'clog3' | 'redlog3g10' | 'flog2' | 'nlog' | 'acescc' | 'acescct';
  'alpha': 'auto' | 'none' | 'straight' | 'premultiplied';
  'hasAudio': boolean;
  'audioStream': number;
  'timecodeStart'?: string;
  'pixelAspect': number;
  'rotation': number;
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface ImageSequenceAssetTypeAttributes {
  'id': string;
  'src': string;
  'first': number;
  'last': number;
  'step': number;
  'fps': string;
  'width': number;
  'height': number;
  'colorSpace': 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'transfer': 'auto' | 'srgb' | 'linear' | 'bt1886' | 'gamma22' | 'gamma26' | 'pq' | 'hlg' | 'slog3' | 'logc3' | 'logc4' | 'vlog' | 'clog3' | 'redlog3g10' | 'flog2' | 'nlog' | 'acescc' | 'acescct';
  'alpha': 'auto' | 'none' | 'straight' | 'premultiplied';
  'missingFrame': 'error' | 'hold' | 'black' | 'transparent';
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface AudioAssetTypeAttributes {
  'id': string;
  'src': string;
  'duration'?: number;
  'sampleRate'?: number;
  'channels'?: number;
  'language'?: string;
  'bpm'?: number;
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface SpanTypeAttributes {
  'style'?: string;
  'size'?: number;
  'color'?: string;
  'role'?: string;
  'font'?: string;
  'fontFile'?: string;
  'fontAsset'?: string;
  'fallback'?: string;
  'weight'?: number;
  'fontStyle'?: 'normal' | 'italic' | 'oblique';
  'stretch'?: number;
  'variation'?: string;
  'features'?: string;
  'strokeColor'?: string;
  'strokeWidth'?: number;
  'strokePosition'?: 'center' | 'inside' | 'outside';
  'shadowColor'?: string;
  'shadowOffsetX'?: number;
  'shadowOffsetY'?: number;
  'shadowBlur'?: number;
  'baselineShift'?: number;
  'tracking'?: number;
  'textTransform'?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
  'decoration'?: 'none' | 'underline' | 'line-through' | 'overline';
  'highlight'?: string;
}

export interface TextAssetTypeAttributes {
  'id': string;
  'text'?: string;
  'width': number;
  'height': number;
  'size': number;
  'style'?: string;
  'color': string;
  'align': 'start' | 'center' | 'end' | 'justify';
  'lineHeight': number;
  'letterSpacing': number;
  'direction': 'auto' | 'ltr' | 'rtl';
  'language'?: string;
  'verticalAlign': 'top' | 'middle' | 'bottom';
  'writingMode': 'horizontal-tb' | 'vertical-rl' | 'vertical-lr';
  'wrap': 'word' | 'character' | 'none' | 'balance';
  'hyphenate': boolean;
  'autoFit': 'none' | 'shrink' | 'grow' | 'fit';
  'minSize'?: number;
  'maxSize'?: number;
  'maxLines'?: number;
  'overflow': 'visible' | 'clip' | 'ellipsis';
  'background'?: string;
  'backgroundMode': 'block' | 'line' | 'word';
  'backgroundPadding': number;
  'backgroundRadius': number;
  'emoji': 'color' | 'text';
  'font'?: string;
  'fontFile'?: string;
  'fontAsset'?: string;
  'fallback'?: string;
  'weight'?: number;
  'fontStyle'?: 'normal' | 'italic' | 'oblique';
  'stretch'?: number;
  'variation'?: string;
  'features'?: string;
  'strokeColor'?: string;
  'strokeWidth'?: number;
  'strokePosition'?: 'center' | 'inside' | 'outside';
  'shadowColor'?: string;
  'shadowOffsetX'?: number;
  'shadowOffsetY'?: number;
  'shadowBlur'?: number;
  'baselineShift'?: number;
  'tracking'?: number;
  'textTransform'?: 'none' | 'uppercase' | 'lowercase' | 'capitalize' | 'small-caps';
  'decoration'?: 'none' | 'underline' | 'line-through' | 'overline';
  'highlight'?: string;
}

export interface VectorAssetTypeAttributes {
  'id': string;
  'shape': 'rect' | 'ellipse' | 'path' | 'rounded-rect' | 'polygon' | 'star' | 'line' | 'svg';
  'src'?: string;
  'width': number;
  'height': number;
  'fill': string;
  'path'?: string;
  'fillRule': 'nonzero' | 'evenodd';
  'stroke': string;
  'strokeWidth': number;
  'radius': number;
  'points': number;
  'innerRadius'?: number;
  'strokeCap': 'butt' | 'round' | 'square';
  'strokeJoin': 'miter' | 'round' | 'bevel';
  'miterLimit': number;
  'dash'?: Array<number>;
  'dashOffset': number;
  'strokePosition': 'center' | 'inside' | 'outside';
  'paintOrder': 'fill-stroke' | 'stroke-fill';
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface MeshAssetTypeAttributes {
  'id': string;
  'src': string;
  'format'?: 'gltf' | 'glb' | 'obj' | 'usd' | 'usdz' | 'fbx' | 'ply' | 'splat';
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface SlotTypeAttributes {
  'id': string;
  'value': string;
}

export interface LottieAssetTypeAttributes {
  'id': string;
  'src': string;
  'width': number;
  'height': number;
  'animation'?: string;
  'segment'?: string;
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface FontAssetTypeAttributes {
  'id': string;
  'src': string;
  'family': string;
  'weight': number;
  'fontStyle': 'normal' | 'italic' | 'oblique';
  'collectionIndex': number;
  'sha256'?: string;
  'license'?: string;
  'credit'?: string;
  'proxy'?: string;
}

export interface GeneratorAssetTypeAttributes {
  'id': string;
  'kind': 'solid' | 'gradient' | 'noise' | 'fractal-noise' | 'cells' | 'checkerboard' | 'grid' | 'stripes' | 'film-grain' | 'light-rays';
  'width': number;
  'height': number;
  'paint': string;
  'paint2': string;
  'scale': number;
  'octaves': number;
  'evolution': number;
  'contrast': number;
  'angle': number;
  'seed'?: bigint;
}

export interface ChartSeriesTypeAttributes {
  'name': string;
  'values': Array<number>;
  'color'?: string;
}

export interface ChartAssetTypeAttributes {
  'id': string;
  'kind': 'bar' | 'column' | 'line' | 'area' | 'pie' | 'donut' | 'scatter' | 'counter' | 'progress';
  'width': number;
  'height': number;
  'labels'?: string;
  'src'?: string;
  'textStyle'?: string;
  'progress': number;
  'showAxes': boolean;
  'showValues': boolean;
  'format'?: string;
}

export interface AudiogramAssetTypeAttributes {
  'id': string;
  'source': string;
  'width': number;
  'height': number;
  'style': 'bars' | 'line' | 'wave' | 'circle' | 'spectrum';
  'bars': number;
  'color': string;
  'smoothing': number;
}

export interface CodeAssetTypeAttributes {
  'id': string;
  'kind': 'qr' | 'datamatrix' | 'pdf417' | 'ean13' | 'upc-a' | 'code128';
  'data': string;
  'width': number;
  'height': number;
  'foreground': string;
  'background': string;
  'errorCorrection': 'L' | 'M' | 'Q' | 'H';
  'quietZone': number;
}

export interface FormulaAssetTypeAttributes {
  'id': string;
  'tex': string;
  'width': number;
  'height': number;
  'size': number;
  'color': string;
}

export interface GeneratedAssetTypeAttributes {
  'id': string;
  'kind': 'image' | 'video' | 'speech' | 'music' | 'sound-effect';
  'provider': string;
  'model': string;
  'prompt'?: string;
  'voice'?: string;
  'language'?: string;
  'seed'?: bigint;
  'cache': string;
  'cacheSha256': string;
  'width'?: number;
  'height'?: number;
  'fps'?: string;
  'duration'?: number;
  'license'?: string;
}

export interface AssetsTypeAttributes {}

export interface MaterialTypeAttributes {
  'id': string;
  'baseColor': string;
  'metallic': number;
  'roughness': number;
  'emissive': string;
  'emissiveStrength': number;
  'opacity': number;
  'alphaMode': 'opaque' | 'mask' | 'blend';
  'alphaCutoff': number;
  'doubleSided': boolean;
  'unlit': boolean;
  'clearcoat': number;
  'clearcoatRoughness': number;
  'transmission': number;
  'ior': number;
  'thickness': number;
  'attenuationColor': string;
  'attenuationDistance'?: number;
  'sheenColor': string;
  'sheenRoughness': number;
  'specular': number;
  'specularColor': string;
  'iridescence': number;
  'iridescenceIor': number;
  'anisotropy': number;
  'anisotropyRotation': number;
  'dispersion': number;
  'baseColorMap'?: string;
  'normalMap'?: string;
  'normalScale': number;
  'metallicRoughnessMap'?: string;
  'occlusionMap'?: string;
  'emissiveMap'?: string;
  'displacementMap'?: string;
  'displacementScale': number;
  'uvScaleX': number;
  'uvScaleY': number;
  'materialX'?: string;
}

export interface MaterialsTypeAttributes {}

export interface WarpPointTypeAttributes {
  'row': number;
  'col': number;
  'x': number;
  'y': number;
}

export interface PuppetPinTypeAttributes {
  'name'?: string;
  'kind': 'position' | 'bend' | 'starch';
  'restX': number;
  'restY': number;
  'x': number;
  'y': number;
  'rotation': number;
  'amount': number;
}

export interface ModifierTypeAttributes {
  'type': 'bend' | 'twist' | 'wave' | 'squash' | 'stretch' | 'mesh-warp' | 'puppet' | 'skin' | 'bulge' | 'pinch' | 'spherize' | 'ripple' | 'turbulence' | 'corner-pin';
  'amount': number;
  'frequency': number;
  'phase': number;
  'axis': string;
  'rows': number;
  'cols': number;
  'centerX'?: number;
  'centerY'?: number;
  'radius'?: number;
  'seed'?: bigint;
  'skeleton'?: string;
  'corners'?: Array<number>;
}

export interface DeformTypeAttributes {}

export interface BoneTypeAttributes {
  'id': string;
  'parent'?: string;
  'x': number;
  'y': number;
  'rotation': number;
  'length': number;
  'scaleX': number;
  'scaleY': number;
}

export interface SkeletonTypeAttributes {
  'id': string;
  'weights'?: string;
}

export interface RigidBodyTypeAttributes {
  'type': 'static' | 'kinematic' | 'dynamic';
  'shape': string;
  'path'?: string;
  'mass': number;
  'friction': number;
  'restitution': number;
  'linearDamping': number;
  'angularDamping': number;
  'velocityX': number;
  'velocityY': number;
  'angularVelocity': number;
  'radius': number;
  'collisionGroup': number;
  'collidesWith': string;
  'sensor': boolean;
  'fixedRotation': boolean;
  'bullet': boolean;
  'activateAt': number;
}

export interface SoftBodyTypeAttributes {
  'mass': number;
  'stiffness': number;
  'damping': number;
  'pressure': number;
  'rows': number;
  'cols': number;
  'pin': 'none' | 'top' | 'bottom' | 'left' | 'right' | 'corners';
  'kind': 'jelly' | 'cloth' | 'rope';
  'selfCollision': boolean;
}

export interface TextAnimatorTypeAttributes {
  'name'?: string;
  'preset'?: 'typewriter' | 'fade-in' | 'fade-out' | 'word-by-word' | 'letter-by-letter' | 'line-by-line' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop' | 'scale-in' | 'blur-in' | 'wave' | 'bounce' | 'spin' | 'ascend' | 'shift' | 'scramble' | 'counter' | 'karaoke' | 'highlight' | 'tracking-in' | 'mask-reveal';
  'presetStart'?: number;
  'presetDuration'?: number;
  'unit': 'character' | 'character-no-space' | 'word' | 'line' | 'span';
  'span'?: string;
  'selector': 'range' | 'wiggly' | 'expression';
  'rangeUnits': 'percent' | 'index';
  'start': number;
  'end': number;
  'offset': number;
  'amount': number;
  'shape': 'square' | 'ramp-up' | 'ramp-down' | 'triangle' | 'round' | 'smooth';
  'smoothness': number;
  'easeHigh': number;
  'easeLow': number;
  'order': 'forward' | 'reverse' | 'center-out' | 'edges-in' | 'random';
  'stagger'?: number;
  'overlap': number;
  'seed'?: bigint;
  'wiggleRate': number;
  'combine': 'add' | 'multiply' | 'replace';
  'x'?: number;
  'y'?: number;
  'zDepth'?: number;
  'scale'?: number;
  'scaleX'?: number;
  'scaleY'?: number;
  'rotation'?: number;
  'rotationX'?: number;
  'rotationY'?: number;
  'skew'?: number;
  'opacity'?: number;
  'fill'?: string;
  'stroke'?: string;
  'strokeWidth'?: number;
  'tracking'?: number;
  'lineSpacing'?: number;
  'blur'?: number;
  'baselineShift'?: number;
  'characterOffset'?: number;
  'variation'?: string;
  'anchorX'?: number;
  'anchorY'?: number;
}

export interface TextPathTypeAttributes {
  'path': string;
  'startOffset': number | string;
  'firstMargin': number;
  'lastMargin': number;
  'reverse': boolean;
  'perpendicular': boolean;
  'forceAlignment': boolean;
}

export interface ShapeModifierTypeAttributes {
  'type': 'repeater' | 'offset-path' | 'pucker-bloat' | 'zig-zag' | 'twist' | 'round-corners' | 'wiggle-path' | 'merge' | 'trim';
  'copies': number;
  'offset': number;
  'amount': number;
  'size': number;
  'ridges': number;
  'frequency': number;
  'detail': number;
  'seed'?: bigint;
  'mode'?: string;
  'offsetX': number;
  'offsetY': number;
  'rotation': number;
  'scale': number;
  'startOpacity': number;
  'endOpacity': number;
  'composite': 'above' | 'below';
}

export interface LayerTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'asset': string;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
  'effects'?: Array<string>;
  'clipIn': number;
  'clipOut'?: number;
  'loop': number;
  'reverse': boolean;
  'speed': number;
  'timeStretch': number;
  'freezeAt'?: number;
  'frameBlend': 'none' | 'frame-mix' | 'optical-flow';
  'fit': 'none' | 'contain' | 'cover' | 'fill' | 'scale-down' | 'contain-blur';
  'boxWidth'?: number | string;
  'boxHeight'?: number | string;
  'focusX': number;
  'focusY': number;
  'cropLeft': number;
  'cropTop': number;
  'cropRight': number;
  'cropBottom': number;
  'flipX': boolean;
  'flipY': boolean;
  'stabilize': boolean;
  'stabilizeSmoothness': number;
  'volume': number;
  'mute': boolean;
  'audioBus'?: string;
}

export interface ShapeTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'shape': 'rect' | 'ellipse' | 'rounded-rect' | 'polygon' | 'star' | 'line' | 'path';
  'width': number | string;
  'height': number | string;
  'path'?: string;
  'fillRule': 'nonzero' | 'evenodd';
  'radius': number;
  'cornerRadii'?: Array<number>;
  'points': number;
  'innerRadius'?: number;
  'outerRadius'?: number;
  'innerRoundness': number;
  'outerRoundness': number;
  'fill': string;
  'stroke': string;
  'strokeWidth': number;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
  'effects'?: Array<string>;
  'strokeCap': 'butt' | 'round' | 'square';
  'strokeJoin': 'miter' | 'round' | 'bevel';
  'miterLimit': number;
  'dash'?: Array<number>;
  'dashOffset': number;
  'strokePosition': 'center' | 'inside' | 'outside';
  'paintOrder': 'fill-stroke' | 'stroke-fill';
  'trimStart': number;
  'trimEnd': number;
  'trimOffset': number;
  'trimMode': 'simultaneous' | 'sequential';
}

export interface BurstTypeAttributes {
  'time': number;
  'count': number;
  'repeat': number;
  'interval': number;
}

export interface ParticleEmitterTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'preset'?: 'smoke' | 'sparks' | 'dust' | 'rain' | 'snow' | 'confetti' | 'fire' | 'bubbles' | 'bokeh' | 'glitter';
  'rate': number;
  'lifetime': number;
  'lifetimeVariance': number;
  'speed': number;
  'speedVariance'?: number;
  'direction': number;
  'spread': number;
  'gravityX': number;
  'gravityY': number;
  'drag': number;
  'turbulence': number;
  'turbulenceScale': number;
  'size': number;
  'sizeEnd'?: number;
  'sizeVariance': number;
  'sizeCurve': 'step' | 'hold' | 'steps' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'catmull-rom' | 'tcb' | 'spring' | 'sine-in' | 'sine-out' | 'sine-in-out' | 'quad-in' | 'quad-out' | 'quad-in-out' | 'cubic-in' | 'cubic-out' | 'cubic-in-out' | 'quart-in' | 'quart-out' | 'quart-in-out' | 'quint-in' | 'quint-out' | 'quint-in-out' | 'expo-in' | 'expo-out' | 'expo-in-out' | 'circ-in' | 'circ-out' | 'circ-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'elastic-in' | 'elastic-out' | 'elastic-in-out' | 'bounce-in' | 'bounce-out' | 'bounce-in-out';
  'color': string;
  'colorEnd'?: string;
  'colorCurve': 'step' | 'hold' | 'steps' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'catmull-rom' | 'tcb' | 'spring' | 'sine-in' | 'sine-out' | 'sine-in-out' | 'quad-in' | 'quad-out' | 'quad-in-out' | 'cubic-in' | 'cubic-out' | 'cubic-in-out' | 'quart-in' | 'quart-out' | 'quart-in-out' | 'quint-in' | 'quint-out' | 'quint-in-out' | 'expo-in' | 'expo-out' | 'expo-in-out' | 'circ-in' | 'circ-out' | 'circ-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'elastic-in' | 'elastic-out' | 'elastic-in-out' | 'bounce-in' | 'bounce-out' | 'bounce-in-out';
  'opacityEnd'?: number;
  'rotation0': number;
  'rotationVariance': number;
  'angularVelocity': number;
  'angularVelocityVariance': number;
  'orientToVelocity': boolean;
  'maxParticles': number;
  'emitterShape': 'point' | 'rect' | 'ellipse' | 'line' | 'path' | 'asset-alpha';
  'emitterWidth': number;
  'emitterHeight': number;
  'emitterPath'?: string;
  'emitterAsset'?: string;
  'seed'?: bigint;
  'shape': 'disc' | 'square' | 'sprite' | 'streak';
  'sprite'?: string;
  'spriteCols': number;
  'spriteRows': number;
  'spriteFps': number;
  'trail': number;
  'forceFields'?: Array<string>;
  'collide': boolean;
  'bounce': number;
  'preroll': number;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
  'effects'?: Array<string>;
}

export interface Object3DTypeAttributes {
  'id': string;
  'name'?: string;
  'primitive': 'sphere' | 'box' | 'plane' | 'mesh' | 'cylinder' | 'cone' | 'torus' | 'capsule' | 'text' | 'extrude';
  'material'?: string;
  'mesh'?: string;
  'text'?: string;
  'font'?: string;
  'path'?: string;
  'depth': number;
  'bevel': number;
  'width'?: number;
  'height'?: number;
  'segments': number;
  'x': number;
  'y': number;
  'z': number;
  'rotation': number;
  'rotationX': number;
  'rotationY': number;
  'scaleX': number;
  'scaleY': number;
  'scaleZ': number;
  'radius': number;
  'castShadow': boolean;
  'receiveShadow': boolean;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'animationClip'?: string;
  'animationSpeed': number;
  'animationOffset': number;
  'morphWeights'?: Array<number>;
  'materialVariant'?: string;
  'instances': number;
}

export interface ShakeTypeAttributes {
  'amplitude': number;
  'frequency': number;
  'rotation': number;
  'zoom': number;
  'octaves': number;
  'seed'?: bigint;
  'start': number;
  'end'?: number;
}

export interface CameraTypeAttributes {
  'id': string;
  'name'?: string;
  'active': boolean;
  'start': number;
  'end'?: number;
  'x': number;
  'y': number;
  'z': number;
  'projection': 'perspective' | 'orthographic';
  'fov': number;
  'near': number;
  'far': number;
  'yaw': number;
  'pitch': number;
  'roll': number;
  'target'?: string;
  'focalLength'?: number;
  'sensorWidth': number;
  'sensorHeight': number;
  'orthoHeight'?: number;
  'depthOfField': boolean;
  'fStop': number;
  'focusDistance': number;
  'focusTarget'?: string;
  'apertureBlades': number;
  'shutterAngle'?: number;
  'exposure': number;
  'lensDistortion': number;
}

export interface GroupTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
  'effects'?: Array<string>;
  'isolate': boolean;
  'collapse': boolean;
  'width'?: number | string;
  'height'?: number | string;
  'clip': boolean;
  'layout': 'none' | 'row' | 'column' | 'stack' | 'grid';
  'gap': number | string;
  'padding': number | string;
  'justify': 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  'alignItems': 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  'gridColumns': number;
  'timeOffset': number;
  'timeScale': number;
}

export interface SequenceTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
  'effects'?: Array<string>;
  'isolate': boolean;
  'collapse': boolean;
  'width'?: number | string;
  'height'?: number | string;
  'clip': boolean;
  'layout': 'none' | 'row' | 'column' | 'stack' | 'grid';
  'gap': number | string;
  'padding': number | string;
  'justify': 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  'alignItems': 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  'gridColumns': number;
  'timeOffset': number;
  'timeScale': number;
  'timeGap': number;
  'transition'?: string;
  'transitionDuration': number;
}

export interface InstanceTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'symbol': string;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
  'effects'?: Array<string>;
  'clipIn': number;
  'clipOut'?: number;
  'loop': number;
  'reverse': boolean;
  'speed': number;
  'fit': 'none' | 'contain' | 'cover' | 'fill' | 'scale-down' | 'contain-blur';
  'boxWidth'?: number | string;
  'boxHeight'?: number | string;
}

export interface IncludeTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'src': string;
  'symbol'?: string;
  'sha256'?: string;
}

export interface RepeatTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'count'?: number;
  'over'?: string;
  'var': string;
  'from': number;
  'step': number;
  'offsetX': number;
  'offsetY': number;
  'rotationStep': number;
  'scaleStep': number;
  'opacityStep': number;
  'timeStep': number;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
}

export interface AdjustmentTypeAttributes {
  'id': string;
  'name'?: string;
  'tags'?: Array<string>;
  'z': number;
  'visible': boolean;
  'opacity': number;
  'start': number;
  'end'?: number;
  'startMarker'?: string;
  'endMarker'?: string;
  'condition'?: string;
  'parent'?: string;
  'motionBlur': 'inherit' | 'on' | 'off';
  'threeD': boolean;
  'zDepth': number;
  'rotationX': number;
  'rotationY': number;
  'matte'?: string;
  'matteMode': 'alpha' | 'alpha-inverted' | 'luma' | 'luma-inverted';
  'matteVisible': boolean;
  'alignX'?: 'left' | 'center' | 'right' | 'stretch';
  'alignY'?: 'top' | 'middle' | 'bottom' | 'stretch';
  'alignTo': 'parent' | 'frame' | 'safe-area';
  'margin': number | string;
  'x': number | string;
  'y': number | string;
  'rotation': number;
  'scaleX': number;
  'scaleY': number;
  'anchorX': number | string;
  'anchorY': number | string;
  'skewX': number;
  'skewY': number;
  'effects': Array<string>;
  'blend': 'normal' | 'dissolve' | 'add' | 'plus-lighter' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion' | 'subtract' | 'divide' | 'darken' | 'lighten' | 'darker-color' | 'lighter-color' | 'color-dodge' | 'color-burn' | 'linear-dodge' | 'linear-burn' | 'soft-light' | 'hard-light' | 'linear-light' | 'vivid-light' | 'pin-light' | 'hard-mix' | 'hue' | 'saturation' | 'color' | 'luminosity' | 'stencil-alpha' | 'stencil-luma' | 'silhouette-alpha' | 'silhouette-luma' | 'alpha-add' | 'behind';
}

export interface TransitionTypeAttributes {
  'id'?: string;
  'type': 'cut' | 'crossfade' | 'additive-dissolve' | 'dip-to-color' | 'wipe' | 'slide' | 'push' | 'cover' | 'reveal' | 'zoom-in' | 'zoom-out' | 'spin' | 'whip-pan' | 'circle-open' | 'circle-close' | 'iris' | 'clock-wipe' | 'radial-wipe' | 'barn-door' | 'blinds' | 'luma' | 'blur' | 'glitch' | 'pixelize' | 'flip' | 'cube' | 'page-curl' | 'film-roll' | 'stripe' | 'squash' | 'shuffle' | 'carousel' | 'light-leak' | 'morph' | 'shader';
  'from'?: string;
  'to'?: string;
  'duration': number;
  'alignment': 'center' | 'start' | 'end';
  'curve': 'step' | 'hold' | 'steps' | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'cubic-bezier' | 'catmull-rom' | 'tcb' | 'spring' | 'sine-in' | 'sine-out' | 'sine-in-out' | 'quad-in' | 'quad-out' | 'quad-in-out' | 'cubic-in' | 'cubic-out' | 'cubic-in-out' | 'quart-in' | 'quart-out' | 'quart-in-out' | 'quint-in' | 'quint-out' | 'quint-in-out' | 'expo-in' | 'expo-out' | 'expo-in-out' | 'circ-in' | 'circ-out' | 'circ-in-out' | 'back-in' | 'back-out' | 'back-in-out' | 'elastic-in' | 'elastic-out' | 'elastic-in-out' | 'bounce-in' | 'bounce-out' | 'bounce-in-out';
  'direction': 'left' | 'right' | 'up' | 'down' | 'angle';
  'angle': number;
  'color': string;
  'softness': number;
  'matte'?: string;
  'shader'?: string;
  'motionBlur': boolean;
  'audio': 'crossfade' | 'equal-power' | 'cut' | 'none';
}

export interface CompositionTypeAttributes {}

export interface SymbolTypeAttributes {
  'id': string;
  'name'?: string;
  'width'?: number;
  'height'?: number;
  'duration'?: number;
  'background': string;
}

export interface SymbolsTypeAttributes {}

export interface EffectTypeAttributes {
  'id': string;
  'type': 'glow' | 'bloom' | 'blur' | 'color-grade' | 'vignette' | 'lens-flare' | 'drop-shadow' | 'lighting' | 'directional-blur' | 'radial-blur' | 'zoom-blur' | 'lens-blur' | 'pixel-motion-blur' | 'tilt-shift' | 'lift-gamma-gain' | 'cdl' | 'lut' | 'curves' | 'levels' | 'white-balance' | 'exposure' | 'hue-saturation' | 'tonemap' | 'tint' | 'tritone' | 'gradient-map' | 'grayscale' | 'sepia' | 'invert' | 'posterize' | 'threshold' | 'color-overlay' | 'gradient-overlay' | 'selective-color' | 'film-grain' | 'noise' | 'chromatic-aberration' | 'sharpen' | 'unsharp-mask' | 'halation' | 'light-leak' | 'light-sweep' | 'glitch' | 'rgb-split' | 'scanlines' | 'vhs' | 'halftone' | 'pixelate' | 'mosaic' | 'emboss' | 'bevel' | 'inner-shadow' | 'inner-glow' | 'long-shadow' | 'stroke' | 'outline' | 'echo' | 'posterize-time' | 'letterbox' | 'mirror' | 'kaleidoscope' | 'tile' | 'displacement-map' | 'turbulent-displace' | 'wave-warp' | 'ripple' | 'twirl' | 'spherize' | 'bulge' | 'lens-distortion' | 'heat-haze' | 'chroma-key' | 'luma-key' | 'difference-key' | 'spill-suppress' | 'matte-choke' | 'fill' | 'fractal-noise' | 'god-rays' | 'shader';
  'enabled': boolean;
  'mix': number;
  'intensity': number;
  'radius': number;
  'threshold': number;
  'saturation': number;
  'contrast': number;
  'brightness': number;
  'color'?: string;
  'paint'?: string;
  'offsetX': number;
  'offsetY': number;
  'lights'?: Array<string>;
  'falloff': 'linear' | 'quadratic' | 'smooth' | 'none';
  'relief': number;
  'angle': number;
  'amount': number;
  'size': number;
  'frequency': number;
  'speed': number;
  'seed'?: bigint;
  'centerX'?: number;
  'centerY'?: number;
  'samples': number;
  'lift'?: string;
  'gamma'?: string;
  'gain'?: string;
  'slope'?: string;
  'offset'?: string;
  'power'?: string;
  'temperature': number;
  'tint': number;
  'exposure': number;
  'hue': number;
  'channel': 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luma';
  'curve'?: string;
  'inputBlack': number;
  'inputWhite': number;
  'outputBlack': number;
  'outputWhite': number;
  'levels': number;
  'keyColor'?: string;
  'tolerance': number;
  'softness': number;
  'spill': number;
  'source'?: string;
  'src'?: string;
  'space'?: 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'tonemapper': 'aces' | 'agx' | 'filmic' | 'reinhard' | 'hable' | 'pq-to-sdr';
  'position': 'outside' | 'inside' | 'center';
  'compositeOriginal': 'behind' | 'on-top' | 'none';
}

export interface EffectsTypeAttributes {}

export interface LightTypeAttributes {
  'id': string;
  'type': 'ambient' | 'directional' | 'point' | 'spot' | 'rect-area' | 'disk-area' | 'sphere-area' | 'dome';
  'color': string;
  'colorTemperature'?: number;
  'intensity': number;
  'exposure': number;
  'range'?: number;
  'falloff': number;
  'spotAngle': number;
  'innerConeAngle'?: number;
  'castShadow': boolean;
  'shadowSoftness': number;
  'shadowBias': number;
  'x': number;
  'y': number;
  'z': number;
  'yaw': number;
  'pitch': number;
  'roll': number;
  'width'?: number;
  'height'?: number;
  'radius'?: number;
  'ies'?: string;
  'environment'?: string;
  'environmentVisible': boolean;
  'affectsDiffuse': boolean;
  'affectsSpecular': boolean;
  'shadowMapSize': number;
}

export interface LightsTypeAttributes {}

export interface ForceFieldTypeAttributes {
  'id': string;
  'type': 'directional' | 'radial' | 'vortex' | 'turbulence' | 'drag' | 'wind' | 'attractor-path';
  'x': number;
  'y': number;
  'forceX': number;
  'forceY': number;
  'strength': number;
  'falloff': number;
  'radius'?: number;
  'scale': number;
  'path'?: string;
  'seed'?: bigint;
  'start': number;
  'end'?: number;
  'affects': 'all' | 'bodies' | 'particles';
}

export interface ConstraintTypeAttributes {
  'id': string;
  'type': 'spring' | 'distance' | 'pin' | 'rope' | 'hinge' | 'slider' | 'weld' | 'motor';
  'a': string;
  'b'?: string;
  'x'?: number;
  'y'?: number;
  'restLength'?: number;
  'stiffness'?: number;
  'damping'?: number;
  'minAngle'?: number;
  'maxAngle'?: number;
  'axisAngle': number;
  'motorSpeed': number;
  'maxForce'?: number;
  'breakForce'?: number;
}

export interface PhysicsTypeAttributes {
  'fixedStep': number;
  'gravityX': number;
  'gravityY': number;
  'pixelsPerMeter': number;
  'solverIterations': number;
  'start': number;
  'bounds': 'none' | 'frame' | 'floor';
  'cache'?: string;
  'cacheSha256'?: string;
}

export interface TrackDataTypeAttributes {
  'id': string;
  'src': string;
  'kind': 'point' | 'planar' | 'camera' | 'mask' | 'face';
  'format': 'json' | 'csv' | 'nuke' | 'after-effects' | 'mocha' | 'fbx';
  'footage'?: string;
  'timeOffset': number;
  'sha256'?: string;
}

export interface TrackingTypeAttributes {}

export interface EqBandTypeAttributes {
  'kind': 'peak' | 'low-shelf' | 'high-shelf' | 'highpass' | 'lowpass' | 'notch';
  'frequency': number;
  'gain': number;
  'q': number;
}

export interface AudioEffectTypeAttributes {
  'type': 'eq' | 'highpass' | 'lowpass' | 'compressor' | 'limiter' | 'gate' | 'de-esser' | 'reverb' | 'delay' | 'chorus' | 'pitch-shift' | 'noise-reduction' | 'stereo-width' | 'gain' | 'distortion' | 'telephone';
  'enabled': boolean;
  'mix': number;
  'frequency'?: number;
  'gain': number;
  'threshold': number;
  'ratio': number;
  'attack': number;
  'release': number;
  'knee': number;
  'time'?: number;
  'feedback': number;
  'roomSize': number;
  'width': number;
  'semitones': number;
  'amount': number;
  'sidechain'?: string;
}

export interface AudioTrackTypeAttributes {
  'id': string;
  'asset': string;
  'start': number;
  'startMarker'?: string;
  'clipIn': number;
  'clipOut'?: number;
  'loop': number;
  'volume': number;
  'gain': number;
  'pan': number;
  'fadeIn': number;
  'fadeOut': number;
  'fadeCurve': 'linear' | 'equal-power' | 'logarithmic' | 'exponential' | 's-curve';
  'speed': number;
  'preservePitch': boolean;
  'reverse': boolean;
  'mute': boolean;
  'role': 'dialogue' | 'voiceover' | 'music' | 'effects' | 'ambience' | 'audio-description' | 'other';
  'language'?: string;
  'bus'?: string;
  'fitToDuration': boolean;
  'duckUnder'?: Array<string>;
  'duckAmount': number;
  'duckThreshold': number;
  'duckAttack': number;
  'duckRelease': number;
}

export interface BusTypeAttributes {
  'id': string;
  'volume': number;
  'gain': number;
  'pan': number;
  'output'?: string;
  'mute': boolean;
  'duckUnder'?: Array<string>;
  'duckAmount': number;
  'duckThreshold': number;
  'duckAttack': number;
  'duckRelease': number;
}

export interface MasterTypeAttributes {
  'volume': number;
  'normalize': 'none' | 'integrated' | 'dynamic';
  'loudness': number;
  'truePeak': number;
  'limiter': boolean;
  'dither': boolean;
}

export interface AudioMixTypeAttributes {
  'sampleRate': number;
  'channels': number;
  'channelLayout': 'auto' | 'mono' | 'stereo' | '5.1' | '7.1' | '7.1.4' | 'ambisonic-1' | 'ambisonic-3';
  'bitDepth': number;
}

export interface WordTypeAttributes {
  'start': number;
  'end': number;
  'text': string;
  'emphasis': boolean;
}

export interface CueTypeAttributes {
  'start': number;
  'end': number;
  'text'?: string;
  'speaker'?: string;
  'style'?: string;
  'position'?: string;
}

export interface CaptionTrackTypeAttributes {
  'id': string;
  'language': string;
  'label'?: string;
  'kind': 'captions' | 'subtitles' | 'sdh' | 'forced';
  'src'?: string;
  'format'?: 'srt' | 'vtt' | 'ass' | 'ttml' | 'itt' | 'scc';
  'transcribe'?: string;
  'cache'?: string;
  'cacheSha256'?: string;
  'mode': 'burn' | 'sidecar' | 'both';
  'preset': 'classic' | 'boxed-line' | 'boxed-word' | 'one-word' | 'karaoke' | 'highlight' | 'pop' | 'fade' | 'bounce' | 'slide' | 'typewriter' | 'enlarge' | 'none';
  'style'?: string;
  'activeStyle'?: string;
  'activeColor'?: string;
  'maxWordsPerLine'?: number;
  'maxCharsPerLine': number;
  'maxLines': number;
  'x': number | string;
  'y': number | string;
  'width': number | string;
  'safeArea'?: string;
  'z': number;
  'profanityFilter': boolean;
}

export interface CaptionsTypeAttributes {}

export interface MarkerTypeAttributes {
  'id'?: string;
  'time': number;
  'duration': number;
  'kind': 'cue' | 'chapter' | 'section' | 'beat' | 'comment' | 'todo' | 'cta';
  'label'?: string;
  'color'?: string;
}

export interface BeatGridTypeAttributes {
  'bpm': number;
  'offset': number;
  'beatsPerBar': number;
  'source'?: string;
}

export interface MarkersTypeAttributes {}

export interface ParamTypeAttributes {
  'id': string;
  'type': 'string' | 'number' | 'boolean' | 'color' | 'asset' | 'enum' | 'list' | 'time';
  'default'?: string;
  'label'?: string;
  'description'?: string;
  'required': boolean;
  'min'?: number;
  'max'?: number;
  'maxLength'?: number;
  'pattern'?: string;
  'options'?: string;
}

export interface BindTypeAttributes {
  'param': string;
  'target': string;
  'property': string;
  'map'?: string;
}

export interface DataSourceTypeAttributes {
  'id': string;
  'src'?: string;
  'format': 'json' | 'csv' | 'tsv';
  'sha256'?: string;
}

export interface SetTypeAttributes {
  'param': string;
  'value': string;
}

export interface VariantTypeAttributes {
  'id': string;
  'label'?: string;
}

export interface ParametersTypeAttributes {}

export interface SafeAreaTypeAttributes {
  'id': string;
  'preset': 'custom' | 'title-safe' | 'action-safe' | 'instagram-reels' | 'instagram-stories' | 'instagram-feed' | 'facebook-reels' | 'tiktok' | 'youtube-shorts' | 'snapchat' | 'pinterest-idea';
  'top'?: number;
  'right'?: number;
  'bottom'?: number;
  'left'?: number;
  'enforce': 'off' | 'warn' | 'error';
}

export interface SafeAreasTypeAttributes {}

export interface LayoutTypeAttributes {
  'id': string;
  'width': number;
  'height': number;
  'aspect'?: string;
  'safeArea'?: string;
  'reframe': 'reflow' | 'crop' | 'fit' | 'fit-blur';
  'focusX': number;
  'focusY': number;
}

export interface LayoutsTypeAttributes {}

export interface LookTypeAttributes {
  'id': string;
  'src'?: string;
  'space': 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'slope'?: string;
  'offset'?: string;
  'power'?: string;
  'saturation': number;
  'mix': number;
}

export interface ColorManagementTypeAttributes {
  'ocioConfig'?: string;
  'workingSpace': 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'looks'?: Array<string>;
  'display': string;
  'view': string;
  'toneMapping': 'none' | 'aces' | 'aces2' | 'agx' | 'filmic' | 'reinhard';
  'exposure': number;
  'bitDepth': '8' | '16' | '16f' | '32f';
}

export interface MetaTypeAttributes {
  'name': string;
  'value': string;
}

export interface AccessibilityTypeAttributes {
  'description'?: string;
  'audioDescription'?: string;
  'requireCaptions': boolean;
  'flashCheck': 'off' | 'warn' | 'error';
  'contrastCheck': 'off' | 'warn' | 'error';
  'minContrast': number;
}

export interface MetadataTypeAttributes {
  'title'?: string;
  'author'?: string;
  'description'?: string;
  'keywords'?: string;
  'copyright'?: string;
  'revision'?: string;
  'created'?: string;
  'modified'?: string;
  'generator'?: string;
  'language'?: string;
}

export interface Scene360TypeAttributes {
  'layout': 'equirectangular' | 'cubemap' | 'eac' | 'fisheye-180';
  'width': number;
  'height': number;
  'viewportCamera'?: string;
  'stereo': 'mono' | 'top-bottom' | 'left-right';
  'interpupillary': number;
}

export interface ProjectTypeAttributes {
  'width': number;
  'height': number;
  'fps': string;
  'duration': number;
  'seed': bigint;
  'linearLight': boolean;
  'workingColorSpace': 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'background': string;
  'mode': 'standard' | 'equirectangular' | 'viewport';
  'antialias3d': number;
  'motionBlur': boolean;
  'shutterAngle': number;
  'shutterPhase': number;
  'motionBlurSamples': number;
  'adaptiveMotionBlur': boolean;
  'timecodeStart'?: string;
  'pixelAspect': number;
  'safeArea'?: string;
  'quality': 'draft' | 'preview' | 'final';
}

export interface StillTypeAttributes {
  'time': number;
  'marker'?: string;
  'path': string;
  'format': 'jpeg' | 'png' | 'webp' | 'avif';
  'width'?: number;
  'quality': number;
}

export interface DestinationTypeAttributes {
  'kind': 'file' | 's3' | 'gcs' | 'azure-blob' | 'http-put' | 'sftp' | 'webhook';
  'uri': string;
  'credentials'?: string;
}

export interface OutputTypeAttributes {
  'id'?: string;
  'path': string;
  'codec': 'h264' | 'h265' | 'ffv1' | 'av1' | 'vp9' | 'prores' | 'dnxhr' | 'gif' | 'apng' | 'webp' | 'png-sequence' | 'jpeg-sequence' | 'exr-sequence' | 'tiff-sequence' | 'audio-only';
  'container'?: 'mp4' | 'mov' | 'mkv' | 'webm' | 'mxf' | 'wav' | 'm4a' | 'mp3';
  'width'?: number;
  'height'?: number;
  'fps'?: string;
  'layout'?: string;
  'variant'?: string;
  'start': number;
  'end'?: number;
  'pixelFormat': string;
  'preset': string;
  'profile'?: string;
  'level'?: string;
  'proresProfile'?: 'proxy' | 'lt' | '422' | 'hq' | '4444' | '4444xq';
  'crf': number;
  'bitrate'?: number;
  'maxBitrate'?: number;
  'bufferSize'?: number;
  'twoPass': boolean;
  'keyframeInterval': number;
  'bFrames'?: number;
  'faststart': boolean;
  'alpha': boolean;
  'audioCodec': string;
  'audioBitrate': number;
  'audio': boolean;
  'colorSpace': 'srgb' | 'linear-srgb' | 'rec709' | 'display-p3' | 'dci-p3' | 'rec2020' | 'acescg' | 'aces2065-1' | 'acescct' | 'xyz-d65' | 'raw';
  'transfer': 'auto' | 'srgb' | 'linear' | 'bt1886' | 'gamma22' | 'gamma26' | 'pq' | 'hlg' | 'slog3' | 'logc3' | 'logc4' | 'vlog' | 'clog3' | 'redlog3g10' | 'flog2' | 'nlog' | 'acescc' | 'acescct';
  'colorRange': 'limited' | 'full';
  'maxCLL'?: number;
  'maxFALL'?: number;
  'masteringDisplay'?: string;
  'sphericalMetadata': boolean;
  'captions'?: Array<string>;
  'burnCaptions'?: string;
  'loopCount': number;
  'maxFileSize'?: number;
  'embedMetadata': boolean;
  'representation'?: string;
}

export interface SceneAttributes {
  'version': '1.0' | '1.1';
}

export interface AttributesByType {
  'paramValueType': ParamValueTypeAttributes;
  'overrideType': OverrideTypeAttributes;
  'keyType': KeyTypeAttributes;
  'animateType': AnimateTypeAttributes;
  'expressionType': ExpressionTypeAttributes;
  'motionPathType': MotionPathTypeAttributes;
  'linkType': LinkTypeAttributes;
  'animatedType': AnimatedTypeAttributes;
  'timeRemapType': TimeRemapTypeAttributes;
  'maskType': MaskTypeAttributes;
  'transformConstraintType': TransformConstraintTypeAttributes;
  'stopType': StopTypeAttributes;
  'gradientBaseType': GradientBaseTypeAttributes;
  'linearGradientType': LinearGradientTypeAttributes;
  'radialGradientType': RadialGradientTypeAttributes;
  'conicGradientType': ConicGradientTypeAttributes;
  'meshPointType': MeshPointTypeAttributes;
  'meshGradientType': MeshGradientTypeAttributes;
  'patternPaintType': PatternPaintTypeAttributes;
  'paintsType': PaintsTypeAttributes;
  'tokenType': TokenTypeAttributes;
  'textStyleType': TextStyleTypeAttributes;
  'stylesType': StylesTypeAttributes;
  'representationType': RepresentationTypeAttributes;
  'imageAssetType': ImageAssetTypeAttributes;
  'videoAssetType': VideoAssetTypeAttributes;
  'imageSequenceAssetType': ImageSequenceAssetTypeAttributes;
  'audioAssetType': AudioAssetTypeAttributes;
  'spanType': SpanTypeAttributes;
  'textAssetType': TextAssetTypeAttributes;
  'vectorAssetType': VectorAssetTypeAttributes;
  'meshAssetType': MeshAssetTypeAttributes;
  'slotType': SlotTypeAttributes;
  'lottieAssetType': LottieAssetTypeAttributes;
  'fontAssetType': FontAssetTypeAttributes;
  'generatorAssetType': GeneratorAssetTypeAttributes;
  'chartSeriesType': ChartSeriesTypeAttributes;
  'chartAssetType': ChartAssetTypeAttributes;
  'audiogramAssetType': AudiogramAssetTypeAttributes;
  'codeAssetType': CodeAssetTypeAttributes;
  'formulaAssetType': FormulaAssetTypeAttributes;
  'generatedAssetType': GeneratedAssetTypeAttributes;
  'assetsType': AssetsTypeAttributes;
  'materialType': MaterialTypeAttributes;
  'materialsType': MaterialsTypeAttributes;
  'warpPointType': WarpPointTypeAttributes;
  'puppetPinType': PuppetPinTypeAttributes;
  'modifierType': ModifierTypeAttributes;
  'deformType': DeformTypeAttributes;
  'boneType': BoneTypeAttributes;
  'skeletonType': SkeletonTypeAttributes;
  'rigidBodyType': RigidBodyTypeAttributes;
  'softBodyType': SoftBodyTypeAttributes;
  'textAnimatorType': TextAnimatorTypeAttributes;
  'textPathType': TextPathTypeAttributes;
  'shapeModifierType': ShapeModifierTypeAttributes;
  'layerType': LayerTypeAttributes;
  'shapeType': ShapeTypeAttributes;
  'burstType': BurstTypeAttributes;
  'particleEmitterType': ParticleEmitterTypeAttributes;
  'object3DType': Object3DTypeAttributes;
  'shakeType': ShakeTypeAttributes;
  'cameraType': CameraTypeAttributes;
  'groupType': GroupTypeAttributes;
  'sequenceType': SequenceTypeAttributes;
  'instanceType': InstanceTypeAttributes;
  'includeType': IncludeTypeAttributes;
  'repeatType': RepeatTypeAttributes;
  'adjustmentType': AdjustmentTypeAttributes;
  'transitionType': TransitionTypeAttributes;
  'compositionType': CompositionTypeAttributes;
  'symbolType': SymbolTypeAttributes;
  'symbolsType': SymbolsTypeAttributes;
  'effectType': EffectTypeAttributes;
  'effectsType': EffectsTypeAttributes;
  'lightType': LightTypeAttributes;
  'lightsType': LightsTypeAttributes;
  'forceFieldType': ForceFieldTypeAttributes;
  'constraintType': ConstraintTypeAttributes;
  'physicsType': PhysicsTypeAttributes;
  'trackDataType': TrackDataTypeAttributes;
  'trackingType': TrackingTypeAttributes;
  'eqBandType': EqBandTypeAttributes;
  'audioEffectType': AudioEffectTypeAttributes;
  'audioTrackType': AudioTrackTypeAttributes;
  'busType': BusTypeAttributes;
  'masterType': MasterTypeAttributes;
  'audioMixType': AudioMixTypeAttributes;
  'wordType': WordTypeAttributes;
  'cueType': CueTypeAttributes;
  'captionTrackType': CaptionTrackTypeAttributes;
  'captionsType': CaptionsTypeAttributes;
  'markerType': MarkerTypeAttributes;
  'beatGridType': BeatGridTypeAttributes;
  'markersType': MarkersTypeAttributes;
  'paramType': ParamTypeAttributes;
  'bindType': BindTypeAttributes;
  'dataSourceType': DataSourceTypeAttributes;
  'setType': SetTypeAttributes;
  'variantType': VariantTypeAttributes;
  'parametersType': ParametersTypeAttributes;
  'safeAreaType': SafeAreaTypeAttributes;
  'safeAreasType': SafeAreasTypeAttributes;
  'layoutType': LayoutTypeAttributes;
  'layoutsType': LayoutsTypeAttributes;
  'lookType': LookTypeAttributes;
  'colorManagementType': ColorManagementTypeAttributes;
  'metaType': MetaTypeAttributes;
  'accessibilityType': AccessibilityTypeAttributes;
  'metadataType': MetadataTypeAttributes;
  'scene360Type': Scene360TypeAttributes;
  'projectType': ProjectTypeAttributes;
  'stillType': StillTypeAttributes;
  'destinationType': DestinationTypeAttributes;
  'outputType': OutputTypeAttributes;
  '/scene': SceneAttributes;
}
