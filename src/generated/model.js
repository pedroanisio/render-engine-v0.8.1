// Generated from schema/scene-render-1.1.xsd by scripts/codegen.js. Do not edit.
/** @type {import('../xsd/model.js').SchemaModel} */
export const MODEL = {
 "version": "1.1",
 "root": {
  "name": "scene",
  "type": "/scene"
 },
 "simpleTypes": {
  "positiveDecimal": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minExclusive": "0"
   }
  },
  "unitDecimal": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "0",
    "maxInclusive": "1"
   }
  },
  "signedUnitDecimal": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "-1",
    "maxInclusive": "1"
   }
  },
  "percentType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "-100",
    "maxInclusive": "100"
   }
  },
  "durationType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minExclusive": "0",
    "maxInclusive": "1000000"
   }
  },
  "lightIntensityType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "0",
    "maxInclusive": "1000000"
   }
  },
  "spotAngleType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "0.5",
    "maxInclusive": "179"
   }
  },
  "effectOffsetType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "-100000",
    "maxInclusive": "100000"
   }
  },
  "effectRadiusType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "0",
    "maxInclusive": "4096"
   }
  },
  "nonNegativeDecimal": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "0"
   }
  },
  "decibelType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "-120",
    "maxInclusive": "24"
   }
  },
  "lufsType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "-70",
    "maxInclusive": "0"
   }
  },
  "kelvinType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "1000",
    "maxInclusive": "40000"
   }
  },
  "gridSizeType": {
   "kind": "restriction",
   "base": "xs:positiveInteger",
   "facets": {
    "minInclusive": "2",
    "maxInclusive": "16"
   }
  },
  "fpsType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "[1-9][0-9]*(/[1-9][0-9]*)?"
    ]
   }
  },
  "aspectType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "[1-9][0-9]*:[1-9][0-9]*"
    ]
   }
  },
  "sha256Type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "[0-9a-f]{64}"
    ]
   }
  },
  "timecodeType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "[0-9]{2}:[0-5][0-9]:[0-5][0-9][:;][0-9]{2}"
    ]
   }
  },
  "languageTagType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "maxLength": 35,
    "patterns": [
     "[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*"
    ]
   }
  },
  "numberListType": {
   "kind": "list",
   "itemType": "xs:double"
  },
  "pointType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "-?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?,-?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?"
    ]
   }
  },
  "relativeLength": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "-?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)(%|vw|vh|vmin|vmax)"
    ]
   }
  },
  "positiveRelativeLength": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "([0-9]*[1-9][0-9]*(\\.[0-9]*)?|[0-9]*\\.[0-9]*[1-9][0-9]*)(%|vw|vh|vmin|vmax)"
    ]
   }
  },
  "lengthType": {
   "kind": "union",
   "memberTypes": [
    "xs:double",
    "relativeLength"
   ]
  },
  "positiveLengthType": {
   "kind": "union",
   "memberTypes": [
    "positiveDecimal",
    "positiveRelativeLength"
   ]
  },
  "colorType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?|(0(\\.[0-9]+)?|1(\\.0+)?|\\.[0-9]+)(,(0(\\.[0-9]+)?|1(\\.0+)?|\\.[0-9]+)){2,3}|var\\(--[A-Za-z0-9_\\-]+\\)"
    ]
   }
  },
  "paintRefType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "url\\(#[A-Za-z_][A-Za-z0-9_.\\-]*\\)"
    ]
   }
  },
  "paintType": {
   "kind": "union",
   "memberTypes": [
    "colorType",
    "paintRefType"
   ]
  },
  "colorSpaceType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "srgb",
     "linear-srgb",
     "rec709",
     "display-p3",
     "dci-p3",
     "rec2020",
     "acescg",
     "aces2065-1",
     "acescct",
     "xyz-d65",
     "raw"
    ]
   }
  },
  "transferType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "auto",
     "srgb",
     "linear",
     "bt1886",
     "gamma22",
     "gamma26",
     "pq",
     "hlg",
     "slog3",
     "logc3",
     "logc4",
     "vlog",
     "clog3",
     "redlog3g10",
     "flog2",
     "nlog",
     "acescc",
     "acescct"
    ]
   }
  },
  "alphaModeType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "auto",
     "none",
     "straight",
     "premultiplied"
    ]
   }
  },
  "blendType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "normal",
     "dissolve",
     "add",
     "plus-lighter",
     "multiply",
     "screen",
     "overlay",
     "difference",
     "exclusion",
     "subtract",
     "divide",
     "darken",
     "lighten",
     "darker-color",
     "lighter-color",
     "color-dodge",
     "color-burn",
     "linear-dodge",
     "linear-burn",
     "soft-light",
     "hard-light",
     "linear-light",
     "vivid-light",
     "pin-light",
     "hard-mix",
     "hue",
     "saturation",
     "color",
     "luminosity",
     "stencil-alpha",
     "stencil-luma",
     "silhouette-alpha",
     "silhouette-luma",
     "alpha-add",
     "behind"
    ]
   }
  },
  "curveType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "step",
     "hold",
     "steps",
     "linear",
     "ease-in",
     "ease-out",
     "ease-in-out",
     "cubic-bezier",
     "catmull-rom",
     "tcb",
     "spring",
     "sine-in",
     "sine-out",
     "sine-in-out",
     "quad-in",
     "quad-out",
     "quad-in-out",
     "cubic-in",
     "cubic-out",
     "cubic-in-out",
     "quart-in",
     "quart-out",
     "quart-in-out",
     "quint-in",
     "quint-out",
     "quint-in-out",
     "expo-in",
     "expo-out",
     "expo-in-out",
     "circ-in",
     "circ-out",
     "circ-in-out",
     "back-in",
     "back-out",
     "back-in-out",
     "elastic-in",
     "elastic-out",
     "elastic-in-out",
     "bounce-in",
     "bounce-out",
     "bounce-in-out"
    ]
   }
  },
  "extrapolationType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "hold",
     "linear",
     "loop",
     "ping-pong",
     "offset"
    ]
   }
  },
  "fitType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "contain",
     "cover",
     "fill",
     "scale-down",
     "contain-blur"
    ]
   }
  },
  "matteModeType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "alpha",
     "alpha-inverted",
     "luma",
     "luma-inverted"
    ]
   }
  },
  "triStateType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "inherit",
     "on",
     "off"
    ]
   }
  },
  "strokeCapType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "butt",
     "round",
     "square"
    ]
   }
  },
  "strokeJoinType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "miter",
     "round",
     "bevel"
    ]
   }
  },
  "strokePositionType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "center",
     "inside",
     "outside"
    ]
   }
  },
  "fillRuleType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "nonzero",
     "evenodd"
    ]
   }
  },
  "expressionString": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "maxLength": 65536
   }
  },
  "fontWeightType": {
   "kind": "restriction",
   "base": "xs:positiveInteger",
   "facets": {
    "maxInclusive": "1000"
   }
  },
  "fontStyleType": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "normal",
     "italic",
     "oblique"
    ]
   }
  },
  "audioSecondsType": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "maxInclusive": "1e7"
   }
  },
  "keyType@stepPosition": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "start",
     "end"
    ]
   }
  },
  "animateType@timeBase": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "composition",
     "local",
     "normalized"
    ]
   }
  },
  "timeRemapType@frameBlend": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "frame-mix",
     "optical-flow"
    ]
   }
  },
  "maskType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "rect",
     "ellipse",
     "rounded-rect",
     "path",
     "polygon",
     "star"
    ]
   }
  },
  "maskType@mode": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "intersect",
     "add",
     "subtract",
     "lighten",
     "darken",
     "difference",
     "none"
    ]
   }
  },
  "transformConstraintType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "parent",
     "look-at",
     "follow-path",
     "copy-position",
     "copy-rotation",
     "copy-scale",
     "copy-transform",
     "distance",
     "ik",
     "track"
    ]
   }
  },
  "transformConstraintType@space": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "world",
     "local"
    ]
   }
  },
  "gradientCommon@spread": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "pad",
     "reflect",
     "repeat"
    ]
   }
  },
  "gradientCommon@units": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "object",
     "user"
    ]
   }
  },
  "gradientCommon@interpolationSpace": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "linear",
     "srgb",
     "oklab",
     "oklch"
    ]
   }
  },
  "meshGradientType@interpolationSpace": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "linear",
     "srgb",
     "oklab"
    ]
   }
  },
  "tokenType@name": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "patterns": [
     "[A-Za-z0-9_\\-]+"
    ]
   }
  },
  "characterStyle@textTransform": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "uppercase",
     "lowercase",
     "capitalize",
     "small-caps"
    ]
   }
  },
  "characterStyle@decoration": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "underline",
     "line-through",
     "overline"
    ]
   }
  },
  "videoAssetType@rotation": {
   "kind": "restriction",
   "base": "xs:integer",
   "facets": {
    "enumeration": [
     "0",
     "90",
     "180",
     "270"
    ]
   }
  },
  "imageSequenceAssetType@missingFrame": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "error",
     "hold",
     "black",
     "transparent"
    ]
   }
  },
  "textAssetType@text": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "maxLength": 1048576
   }
  },
  "textAssetType@size": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minExclusive": "0",
    "maxInclusive": "4096"
   }
  },
  "textAssetType@align": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "start",
     "center",
     "end",
     "justify"
    ]
   }
  },
  "textAssetType@lineHeight": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "0.1",
    "maxInclusive": "10"
   }
  },
  "textAssetType@letterSpacing": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "-4096",
    "maxInclusive": "16384"
   }
  },
  "textAssetType@direction": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "auto",
     "ltr",
     "rtl"
    ]
   }
  },
  "textAssetType@verticalAlign": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "top",
     "middle",
     "bottom"
    ]
   }
  },
  "textAssetType@writingMode": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "horizontal-tb",
     "vertical-rl",
     "vertical-lr"
    ]
   }
  },
  "textAssetType@wrap": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "word",
     "character",
     "none",
     "balance"
    ]
   }
  },
  "textAssetType@autoFit": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "shrink",
     "grow",
     "fit"
    ]
   }
  },
  "textAssetType@overflow": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "visible",
     "clip",
     "ellipsis"
    ]
   }
  },
  "textAssetType@backgroundMode": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "block",
     "line",
     "word"
    ]
   }
  },
  "textAssetType@emoji": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "color",
     "text"
    ]
   }
  },
  "vectorAssetType@shape": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "rect",
     "ellipse",
     "path",
     "rounded-rect",
     "polygon",
     "star",
     "line",
     "svg"
    ]
   }
  },
  "strokeStyle@paintOrder": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "fill-stroke",
     "stroke-fill"
    ]
   }
  },
  "meshAssetType@format": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "gltf",
     "glb",
     "obj",
     "usd",
     "usdz",
     "fbx",
     "ply",
     "splat"
    ]
   }
  },
  "generatorAssetType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "solid",
     "gradient",
     "noise",
     "fractal-noise",
     "cells",
     "checkerboard",
     "grid",
     "stripes",
     "film-grain",
     "light-rays"
    ]
   }
  },
  "chartAssetType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "bar",
     "column",
     "line",
     "area",
     "pie",
     "donut",
     "scatter",
     "counter",
     "progress"
    ]
   }
  },
  "audiogramAssetType@style": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "bars",
     "line",
     "wave",
     "circle",
     "spectrum"
    ]
   }
  },
  "codeAssetType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "qr",
     "datamatrix",
     "pdf417",
     "ean13",
     "upc-a",
     "code128"
    ]
   }
  },
  "codeAssetType@errorCorrection": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "L",
     "M",
     "Q",
     "H"
    ]
   }
  },
  "generatedAssetType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "image",
     "video",
     "speech",
     "music",
     "sound-effect"
    ]
   }
  },
  "materialType@alphaMode": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "opaque",
     "mask",
     "blend"
    ]
   }
  },
  "puppetPinType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "position",
     "bend",
     "starch"
    ]
   }
  },
  "modifierType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "bend",
     "twist",
     "wave",
     "squash",
     "stretch",
     "mesh-warp",
     "puppet",
     "skin",
     "bulge",
     "pinch",
     "spherize",
     "ripple",
     "turbulence",
     "corner-pin"
    ]
   }
  },
  "rigidBodyType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "static",
     "kinematic",
     "dynamic"
    ]
   }
  },
  "softBodyType@pin": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "top",
     "bottom",
     "left",
     "right",
     "corners"
    ]
   }
  },
  "softBodyType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "jelly",
     "cloth",
     "rope"
    ]
   }
  },
  "textAnimatorType@preset": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "typewriter",
     "fade-in",
     "fade-out",
     "word-by-word",
     "letter-by-letter",
     "line-by-line",
     "slide-up",
     "slide-down",
     "slide-left",
     "slide-right",
     "pop",
     "scale-in",
     "blur-in",
     "wave",
     "bounce",
     "spin",
     "ascend",
     "shift",
     "scramble",
     "counter",
     "karaoke",
     "highlight",
     "tracking-in",
     "mask-reveal"
    ]
   }
  },
  "textAnimatorType@unit": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "character",
     "character-no-space",
     "word",
     "line",
     "span"
    ]
   }
  },
  "textAnimatorType@selector": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "range",
     "wiggly",
     "expression"
    ]
   }
  },
  "textAnimatorType@rangeUnits": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "percent",
     "index"
    ]
   }
  },
  "textAnimatorType@shape": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "square",
     "ramp-up",
     "ramp-down",
     "triangle",
     "round",
     "smooth"
    ]
   }
  },
  "textAnimatorType@order": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "forward",
     "reverse",
     "center-out",
     "edges-in",
     "random"
    ]
   }
  },
  "textAnimatorType@combine": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "add",
     "multiply",
     "replace"
    ]
   }
  },
  "shapeModifierType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "repeater",
     "offset-path",
     "pucker-bloat",
     "zig-zag",
     "twist",
     "round-corners",
     "wiggle-path",
     "merge",
     "trim"
    ]
   }
  },
  "shapeModifierType@composite": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "above",
     "below"
    ]
   }
  },
  "nodeAttributes@alignX": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "left",
     "center",
     "right",
     "stretch"
    ]
   }
  },
  "nodeAttributes@alignY": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "top",
     "middle",
     "bottom",
     "stretch"
    ]
   }
  },
  "nodeAttributes@alignTo": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "parent",
     "frame",
     "safe-area"
    ]
   }
  },
  "layerType@frameBlend": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "frame-mix",
     "optical-flow"
    ]
   }
  },
  "shapeType@shape": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "rect",
     "ellipse",
     "rounded-rect",
     "polygon",
     "star",
     "line",
     "path"
    ]
   }
  },
  "trimPath@trimMode": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "simultaneous",
     "sequential"
    ]
   }
  },
  "particleEmitterType@preset": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "smoke",
     "sparks",
     "dust",
     "rain",
     "snow",
     "confetti",
     "fire",
     "bubbles",
     "bokeh",
     "glitter"
    ]
   }
  },
  "particleEmitterType@maxParticles": {
   "kind": "restriction",
   "base": "xs:positiveInteger",
   "facets": {
    "maxInclusive": "10000000"
   }
  },
  "particleEmitterType@emitterShape": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "point",
     "rect",
     "ellipse",
     "line",
     "path",
     "asset-alpha"
    ]
   }
  },
  "particleEmitterType@shape": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "disc",
     "square",
     "sprite",
     "streak"
    ]
   }
  },
  "object3DType@primitive": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "sphere",
     "box",
     "plane",
     "mesh",
     "cylinder",
     "cone",
     "torus",
     "capsule",
     "text",
     "extrude"
    ]
   }
  },
  "cameraType@projection": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "perspective",
     "orthographic"
    ]
   }
  },
  "cameraType@apertureBlades": {
   "kind": "restriction",
   "base": "xs:nonNegativeInteger",
   "facets": {
    "maxInclusive": "16"
   }
  },
  "groupType@layout": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "row",
     "column",
     "stack",
     "grid"
    ]
   }
  },
  "groupType@justify": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "start",
     "center",
     "end",
     "space-between",
     "space-around",
     "space-evenly"
    ]
   }
  },
  "groupType@alignItems": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "start",
     "center",
     "end",
     "stretch",
     "baseline"
    ]
   }
  },
  "transitionType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "cut",
     "crossfade",
     "additive-dissolve",
     "dip-to-color",
     "wipe",
     "slide",
     "push",
     "cover",
     "reveal",
     "zoom-in",
     "zoom-out",
     "spin",
     "whip-pan",
     "circle-open",
     "circle-close",
     "iris",
     "clock-wipe",
     "radial-wipe",
     "barn-door",
     "blinds",
     "luma",
     "blur",
     "glitch",
     "pixelize",
     "flip",
     "cube",
     "page-curl",
     "film-roll",
     "stripe",
     "squash",
     "shuffle",
     "carousel",
     "light-leak",
     "morph",
     "shader"
    ]
   }
  },
  "transitionType@alignment": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "center",
     "start",
     "end"
    ]
   }
  },
  "transitionType@direction": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "left",
     "right",
     "up",
     "down",
     "angle"
    ]
   }
  },
  "transitionType@audio": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "crossfade",
     "equal-power",
     "cut",
     "none"
    ]
   }
  },
  "effectType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "glow",
     "bloom",
     "blur",
     "color-grade",
     "vignette",
     "lens-flare",
     "drop-shadow",
     "lighting",
     "directional-blur",
     "radial-blur",
     "zoom-blur",
     "lens-blur",
     "pixel-motion-blur",
     "tilt-shift",
     "lift-gamma-gain",
     "cdl",
     "lut",
     "curves",
     "levels",
     "white-balance",
     "exposure",
     "hue-saturation",
     "tonemap",
     "tint",
     "tritone",
     "gradient-map",
     "grayscale",
     "sepia",
     "invert",
     "posterize",
     "threshold",
     "color-overlay",
     "gradient-overlay",
     "selective-color",
     "film-grain",
     "noise",
     "chromatic-aberration",
     "sharpen",
     "unsharp-mask",
     "halation",
     "light-leak",
     "light-sweep",
     "glitch",
     "rgb-split",
     "scanlines",
     "vhs",
     "halftone",
     "pixelate",
     "mosaic",
     "emboss",
     "bevel",
     "inner-shadow",
     "inner-glow",
     "long-shadow",
     "stroke",
     "outline",
     "echo",
     "posterize-time",
     "letterbox",
     "mirror",
     "kaleidoscope",
     "tile",
     "displacement-map",
     "turbulent-displace",
     "wave-warp",
     "ripple",
     "twirl",
     "spherize",
     "bulge",
     "lens-distortion",
     "heat-haze",
     "chroma-key",
     "luma-key",
     "difference-key",
     "spill-suppress",
     "matte-choke",
     "fill",
     "fractal-noise",
     "god-rays",
     "shader"
    ]
   }
  },
  "effectType@falloff": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "linear",
     "quadratic",
     "smooth",
     "none"
    ]
   }
  },
  "effectType@channel": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "rgb",
     "red",
     "green",
     "blue",
     "alpha",
     "luma"
    ]
   }
  },
  "effectType@tonemapper": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "aces",
     "agx",
     "filmic",
     "reinhard",
     "hable",
     "pq-to-sdr"
    ]
   }
  },
  "effectType@position": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "outside",
     "inside",
     "center"
    ]
   }
  },
  "effectType@compositeOriginal": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "behind",
     "on-top",
     "none"
    ]
   }
  },
  "lightType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "ambient",
     "directional",
     "point",
     "spot",
     "rect-area",
     "disk-area",
     "sphere-area",
     "dome"
    ]
   }
  },
  "lightType@shadowMapSize": {
   "kind": "restriction",
   "base": "xs:positiveInteger",
   "facets": {
    "minInclusive": "16",
    "maxInclusive": "8192"
   }
  },
  "forceFieldType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "directional",
     "radial",
     "vortex",
     "turbulence",
     "drag",
     "wind",
     "attractor-path"
    ]
   }
  },
  "forceFieldType@affects": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "all",
     "bodies",
     "particles"
    ]
   }
  },
  "constraintType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "spring",
     "distance",
     "pin",
     "rope",
     "hinge",
     "slider",
     "weld",
     "motor"
    ]
   }
  },
  "physicsType@bounds": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "frame",
     "floor"
    ]
   }
  },
  "trackDataType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "point",
     "planar",
     "camera",
     "mask",
     "face"
    ]
   }
  },
  "trackDataType@format": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "json",
     "csv",
     "nuke",
     "after-effects",
     "mocha",
     "fbx"
    ]
   }
  },
  "eqBandType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "peak",
     "low-shelf",
     "high-shelf",
     "highpass",
     "lowpass",
     "notch"
    ]
   }
  },
  "audioEffectType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "eq",
     "highpass",
     "lowpass",
     "compressor",
     "limiter",
     "gate",
     "de-esser",
     "reverb",
     "delay",
     "chorus",
     "pitch-shift",
     "noise-reduction",
     "stereo-width",
     "gain",
     "distortion",
     "telephone"
    ]
   }
  },
  "audioTrackType@fadeCurve": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "linear",
     "equal-power",
     "logarithmic",
     "exponential",
     "s-curve"
    ]
   }
  },
  "audioTrackType@role": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "dialogue",
     "voiceover",
     "music",
     "effects",
     "ambience",
     "audio-description",
     "other"
    ]
   }
  },
  "masterType@normalize": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "integrated",
     "dynamic"
    ]
   }
  },
  "audioMixType@channelLayout": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "auto",
     "mono",
     "stereo",
     "5.1",
     "7.1",
     "7.1.4",
     "ambisonic-1",
     "ambisonic-3"
    ]
   }
  },
  "audioMixType@bitDepth": {
   "kind": "restriction",
   "base": "xs:positiveInteger",
   "facets": {
    "enumeration": [
     "16",
     "24",
     "32"
    ]
   }
  },
  "captionTrackType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "captions",
     "subtitles",
     "sdh",
     "forced"
    ]
   }
  },
  "captionTrackType@format": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "srt",
     "vtt",
     "ass",
     "ttml",
     "itt",
     "scc"
    ]
   }
  },
  "captionTrackType@mode": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "burn",
     "sidecar",
     "both"
    ]
   }
  },
  "captionTrackType@preset": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "classic",
     "boxed-line",
     "boxed-word",
     "one-word",
     "karaoke",
     "highlight",
     "pop",
     "fade",
     "bounce",
     "slide",
     "typewriter",
     "enlarge",
     "none"
    ]
   }
  },
  "markerType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "cue",
     "chapter",
     "section",
     "beat",
     "comment",
     "todo",
     "cta"
    ]
   }
  },
  "paramType@type": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "string",
     "number",
     "boolean",
     "color",
     "asset",
     "enum",
     "list",
     "time"
    ]
   }
  },
  "dataSourceType@format": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "json",
     "csv",
     "tsv"
    ]
   }
  },
  "safeAreaType@preset": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "custom",
     "title-safe",
     "action-safe",
     "instagram-reels",
     "instagram-stories",
     "instagram-feed",
     "facebook-reels",
     "tiktok",
     "youtube-shorts",
     "snapchat",
     "pinterest-idea"
    ]
   }
  },
  "safeAreaType@enforce": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "off",
     "warn",
     "error"
    ]
   }
  },
  "layoutType@reframe": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "reflow",
     "crop",
     "fit",
     "fit-blur"
    ]
   }
  },
  "colorManagementType@toneMapping": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "none",
     "aces",
     "aces2",
     "agx",
     "filmic",
     "reinhard"
    ]
   }
  },
  "colorManagementType@bitDepth": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "8",
     "16",
     "16f",
     "32f"
    ]
   }
  },
  "accessibilityType@flashCheck": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "off",
     "warn",
     "error"
    ]
   }
  },
  "accessibilityType@contrastCheck": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "off",
     "warn",
     "error"
    ]
   }
  },
  "scene360Type@layout": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "equirectangular",
     "cubemap",
     "eac",
     "fisheye-180"
    ]
   }
  },
  "scene360Type@stereo": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "mono",
     "top-bottom",
     "left-right"
    ]
   }
  },
  "projectType@mode": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "standard",
     "equirectangular",
     "viewport"
    ]
   }
  },
  "projectType@antialias3d": {
   "kind": "restriction",
   "base": "xs:positiveInteger",
   "facets": {
    "maxInclusive": "4"
   }
  },
  "projectType@shutterAngle": {
   "kind": "restriction",
   "base": "xs:double",
   "facets": {
    "minInclusive": "0",
    "maxInclusive": "720"
   }
  },
  "projectType@motionBlurSamples": {
   "kind": "restriction",
   "base": "xs:positiveInteger",
   "facets": {
    "maxInclusive": "256"
   }
  },
  "projectType@quality": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "draft",
     "preview",
     "final"
    ]
   }
  },
  "stillType@format": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "jpeg",
     "png",
     "webp",
     "avif"
    ]
   }
  },
  "destinationType@kind": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "file",
     "s3",
     "gcs",
     "azure-blob",
     "http-put",
     "sftp",
     "webhook"
    ]
   }
  },
  "outputType@codec": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "h264",
     "h265",
     "ffv1",
     "av1",
     "vp9",
     "prores",
     "dnxhr",
     "gif",
     "apng",
     "webp",
     "png-sequence",
     "jpeg-sequence",
     "exr-sequence",
     "tiff-sequence",
     "audio-only"
    ]
   }
  },
  "outputType@container": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "mp4",
     "mov",
     "mkv",
     "webm",
     "mxf",
     "wav",
     "m4a",
     "mp3"
    ]
   }
  },
  "outputType@proresProfile": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "proxy",
     "lt",
     "422",
     "hq",
     "4444",
     "4444xq"
    ]
   }
  },
  "outputType@colorRange": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "limited",
     "full"
    ]
   }
  },
  "/scene@version": {
   "kind": "restriction",
   "base": "xs:string",
   "facets": {
    "enumeration": [
     "1.0",
     "1.1"
    ]
   }
  }
 },
 "complexTypes": {
  "paramValueType": {
   "attributes": {
    "name": {
     "type": "xs:NMTOKEN",
     "required": true,
     "default": null
    },
    "value": {
     "type": "xs:string",
     "required": true,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "overrideType": {
   "attributes": {
    "target": {
     "type": "xs:NCName",
     "required": true,
     "default": null
    },
    "property": {
     "type": "xs:NMTOKEN",
     "required": true,
     "default": null
    },
    "value": {
     "type": "xs:string",
     "required": true,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "keyType": {
   "attributes": {
    "time": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "value": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "interpolation": {
     "type": "curveType",
     "required": false,
     "default": null
    },
    "bezier": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "easeIn": {
     "type": "pointType",
     "required": false,
     "default": null
    },
    "easeOut": {
     "type": "pointType",
     "required": false,
     "default": null
    },
    "spatialIn": {
     "type": "pointType",
     "required": false,
     "default": null
    },
    "spatialOut": {
     "type": "pointType",
     "required": false,
     "default": null
    },
    "roving": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "steps": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "stepPosition": {
     "type": "keyType@stepPosition",
     "required": false,
     "default": "end"
    },
    "tension": {
     "type": "signedUnitDecimal",
     "required": false,
     "default": "0"
    },
    "continuity": {
     "type": "signedUnitDecimal",
     "required": false,
     "default": "0"
    },
    "bias": {
     "type": "signedUnitDecimal",
     "required": false,
     "default": "0"
    },
    "stiffness": {
     "type": "positiveDecimal",
     "required": false,
     "default": "100"
    },
    "damping": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "10"
    },
    "mass": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "marker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "animateType": {
   "attributes": {
    "property": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "defaultInterpolation": {
     "type": "curveType",
     "required": false,
     "default": "linear"
    },
    "extrapolateBefore": {
     "type": "extrapolationType",
     "required": false,
     "default": "hold"
    },
    "extrapolateAfter": {
     "type": "extrapolationType",
     "required": false,
     "default": "hold"
    },
    "additive": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "timeBase": {
     "type": "animateType@timeBase",
     "required": false,
     "default": "composition"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "key",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "key": "keyType"
    }
   }
  },
  "expressionType": {
   "attributes": {
    "property": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "enabled": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    }
   },
   "content": {
    "kind": "simple",
    "type": "expressionString"
   }
  },
  "motionPathType": {
   "attributes": {
    "path": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "interpolation": {
     "type": "curveType",
     "required": false,
     "default": "linear"
    },
    "autoOrient": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "orientOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "constantSpeed": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "animate": "animateType"
    }
   }
  },
  "linkType": {
   "attributes": {
    "property": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "source": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "scale": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "offset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "min": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "max": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "delay": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "smoothing": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "animatedType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "timeRemapType": {
   "attributes": {
    "defaultInterpolation": {
     "type": "curveType",
     "required": false,
     "default": "linear"
    },
    "frameBlend": {
     "type": "timeRemapType@frameBlend",
     "required": false,
     "default": "none"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "key",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "key": "keyType"
    }
   }
  },
  "maskType": {
   "attributes": {
    "type": {
     "type": "maskType@type",
     "required": true,
     "default": null
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "width": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "height": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "radius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "invert": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "path": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "points": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "5"
    },
    "innerRadius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "fillRule": {
     "type": "fillRuleType",
     "required": false,
     "default": "nonzero"
    },
    "feather": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "expansion": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "mode": {
     "type": "maskType@mode",
     "required": false,
     "default": "intersect"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "transformConstraintType": {
   "attributes": {
    "type": {
     "type": "transformConstraintType@type",
     "required": true,
     "default": null
    },
    "target": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "path": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "point": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "influence": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "space": {
     "type": "transformConstraintType@space",
     "required": false,
     "default": "world"
    },
    "offsetX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "offsetY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "offsetRotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "minDistance": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "maxDistance": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "bendPositive": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "progress": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "autoOrient": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "stopType": {
   "attributes": {
    "offset": {
     "type": "unitDecimal",
     "required": true,
     "default": null
    },
    "color": {
     "type": "colorType",
     "required": true,
     "default": null
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "midpoint": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "gradientBaseType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "spread": {
     "type": "gradientCommon@spread",
     "required": false,
     "default": "pad"
    },
    "units": {
     "type": "gradientCommon@units",
     "required": false,
     "default": "object"
    },
    "interpolationSpace": {
     "type": "gradientCommon@interpolationSpace",
     "required": false,
     "default": "linear"
    },
    "dither": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "stop",
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "stop": "stopType",
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "linearGradientType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "spread": {
     "type": "gradientCommon@spread",
     "required": false,
     "default": "pad"
    },
    "units": {
     "type": "gradientCommon@units",
     "required": false,
     "default": "object"
    },
    "interpolationSpace": {
     "type": "gradientCommon@interpolationSpace",
     "required": false,
     "default": "linear"
    },
    "dither": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "x1": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y1": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "x2": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "y2": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "stop",
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "stop": "stopType",
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "radialGradientType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "spread": {
     "type": "gradientCommon@spread",
     "required": false,
     "default": "pad"
    },
    "units": {
     "type": "gradientCommon@units",
     "required": false,
     "default": "object"
    },
    "interpolationSpace": {
     "type": "gradientCommon@interpolationSpace",
     "required": false,
     "default": "linear"
    },
    "dither": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "cx": {
     "type": "xs:double",
     "required": false,
     "default": "0.5"
    },
    "cy": {
     "type": "xs:double",
     "required": false,
     "default": "0.5"
    },
    "r": {
     "type": "positiveDecimal",
     "required": false,
     "default": "0.5"
    },
    "fx": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "fy": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "fr": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "aspect": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "stop",
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "stop": "stopType",
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "conicGradientType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "spread": {
     "type": "gradientCommon@spread",
     "required": false,
     "default": "pad"
    },
    "units": {
     "type": "gradientCommon@units",
     "required": false,
     "default": "object"
    },
    "interpolationSpace": {
     "type": "gradientCommon@interpolationSpace",
     "required": false,
     "default": "linear"
    },
    "dither": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "cx": {
     "type": "xs:double",
     "required": false,
     "default": "0.5"
    },
    "cy": {
     "type": "xs:double",
     "required": false,
     "default": "0.5"
    },
    "angle": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "stop",
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "stop": "stopType",
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "meshPointType": {
   "attributes": {
    "row": {
     "type": "xs:nonNegativeInteger",
     "required": true,
     "default": null
    },
    "col": {
     "type": "xs:nonNegativeInteger",
     "required": true,
     "default": null
    },
    "color": {
     "type": "colorType",
     "required": true,
     "default": null
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "meshGradientType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "rows": {
     "type": "gridSizeType",
     "required": false,
     "default": "2"
    },
    "cols": {
     "type": "gridSizeType",
     "required": false,
     "default": "2"
    },
    "interpolationSpace": {
     "type": "meshGradientType@interpolationSpace",
     "required": false,
     "default": "oklab"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "point",
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "point": "meshPointType",
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "patternPaintType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "asset": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "tileWidth": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "tileHeight": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "offsetX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "offsetY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scale": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "paintsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "linearGradient",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "radialGradient",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "conicGradient",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "meshGradient",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "pattern",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "linearGradient": "linearGradientType",
     "radialGradient": "radialGradientType",
     "conicGradient": "conicGradientType",
     "meshGradient": "meshGradientType",
     "pattern": "patternPaintType"
    }
   }
  },
  "tokenType": {
   "attributes": {
    "name": {
     "type": "tokenType@name",
     "required": true,
     "default": null
    },
    "value": {
     "type": "xs:string",
     "required": true,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "textStyleType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "basedOn": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "size": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "color": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "lineHeight": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "font": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "fontFile": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "fontAsset": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "fallback": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "weight": {
     "type": "fontWeightType",
     "required": false,
     "default": null
    },
    "fontStyle": {
     "type": "fontStyleType",
     "required": false,
     "default": null
    },
    "stretch": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "variation": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "features": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "strokeColor": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "strokeWidth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "strokePosition": {
     "type": "strokePositionType",
     "required": false,
     "default": null
    },
    "shadowColor": {
     "type": "colorType",
     "required": false,
     "default": null
    },
    "shadowOffsetX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "shadowOffsetY": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "shadowBlur": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "baselineShift": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "tracking": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "textTransform": {
     "type": "characterStyle@textTransform",
     "required": false,
     "default": null
    },
    "decoration": {
     "type": "characterStyle@decoration",
     "required": false,
     "default": null
    },
    "highlight": {
     "type": "paintType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "stylesType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "token",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "textStyle",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "token": "tokenType",
     "textStyle": "textStyleType"
    }
   }
  },
  "representationType": {
   "attributes": {
    "name": {
     "type": "xs:NMTOKEN",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "colorSpace": {
     "type": "colorSpaceType",
     "required": false,
     "default": null
    },
    "transfer": {
     "type": "transferType",
     "required": false,
     "default": null
    },
    "language": {
     "type": "languageTagType",
     "required": false,
     "default": null
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "imageAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "colorSpace": {
     "type": "colorSpaceType",
     "required": false,
     "default": "srgb"
    },
    "transfer": {
     "type": "transferType",
     "required": false,
     "default": "auto"
    },
    "alpha": {
     "type": "alphaModeType",
     "required": false,
     "default": "auto"
    },
    "layer": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "representation",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "representation": "representationType"
    }
   }
  },
  "videoAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "fps": {
     "type": "fpsType",
     "required": true,
     "default": null
    },
    "duration": {
     "type": "positiveDecimal",
     "required": true,
     "default": null
    },
    "colorSpace": {
     "type": "colorSpaceType",
     "required": false,
     "default": "srgb"
    },
    "transfer": {
     "type": "transferType",
     "required": false,
     "default": "auto"
    },
    "alpha": {
     "type": "alphaModeType",
     "required": false,
     "default": "auto"
    },
    "hasAudio": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "audioStream": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "timecodeStart": {
     "type": "timecodeType",
     "required": false,
     "default": null
    },
    "pixelAspect": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "rotation": {
     "type": "videoAssetType@rotation",
     "required": false,
     "default": "0"
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "representation",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "representation": "representationType"
    }
   }
  },
  "imageSequenceAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "first": {
     "type": "xs:integer",
     "required": true,
     "default": null
    },
    "last": {
     "type": "xs:integer",
     "required": true,
     "default": null
    },
    "step": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "1"
    },
    "fps": {
     "type": "fpsType",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "colorSpace": {
     "type": "colorSpaceType",
     "required": false,
     "default": "srgb"
    },
    "transfer": {
     "type": "transferType",
     "required": false,
     "default": "auto"
    },
    "alpha": {
     "type": "alphaModeType",
     "required": false,
     "default": "auto"
    },
    "missingFrame": {
     "type": "imageSequenceAssetType@missingFrame",
     "required": false,
     "default": "error"
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "audioAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "duration": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "sampleRate": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "channels": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "language": {
     "type": "languageTagType",
     "required": false,
     "default": null
    },
    "bpm": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "representation",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "representation": "representationType"
    }
   }
  },
  "spanType": {
   "attributes": {
    "style": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "size": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "color": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "role": {
     "type": "xs:NMTOKEN",
     "required": false,
     "default": null
    },
    "font": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "fontFile": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "fontAsset": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "fallback": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "weight": {
     "type": "fontWeightType",
     "required": false,
     "default": null
    },
    "fontStyle": {
     "type": "fontStyleType",
     "required": false,
     "default": null
    },
    "stretch": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "variation": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "features": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "strokeColor": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "strokeWidth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "strokePosition": {
     "type": "strokePositionType",
     "required": false,
     "default": null
    },
    "shadowColor": {
     "type": "colorType",
     "required": false,
     "default": null
    },
    "shadowOffsetX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "shadowOffsetY": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "shadowBlur": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "baselineShift": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "tracking": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "textTransform": {
     "type": "characterStyle@textTransform",
     "required": false,
     "default": null
    },
    "decoration": {
     "type": "characterStyle@decoration",
     "required": false,
     "default": null
    },
    "highlight": {
     "type": "paintType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "simple",
    "type": "xs:string"
   }
  },
  "textAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "text": {
     "type": "textAssetType@text",
     "required": false,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "size": {
     "type": "textAssetType@size",
     "required": true,
     "default": null
    },
    "style": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "color": {
     "type": "paintType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "align": {
     "type": "textAssetType@align",
     "required": false,
     "default": "start"
    },
    "lineHeight": {
     "type": "textAssetType@lineHeight",
     "required": false,
     "default": "1.2"
    },
    "letterSpacing": {
     "type": "textAssetType@letterSpacing",
     "required": false,
     "default": "0"
    },
    "direction": {
     "type": "textAssetType@direction",
     "required": false,
     "default": "auto"
    },
    "language": {
     "type": "languageTagType",
     "required": false,
     "default": null
    },
    "verticalAlign": {
     "type": "textAssetType@verticalAlign",
     "required": false,
     "default": "top"
    },
    "writingMode": {
     "type": "textAssetType@writingMode",
     "required": false,
     "default": "horizontal-tb"
    },
    "wrap": {
     "type": "textAssetType@wrap",
     "required": false,
     "default": "word"
    },
    "hyphenate": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "autoFit": {
     "type": "textAssetType@autoFit",
     "required": false,
     "default": "none"
    },
    "minSize": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "maxSize": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "maxLines": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "overflow": {
     "type": "textAssetType@overflow",
     "required": false,
     "default": "visible"
    },
    "background": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "backgroundMode": {
     "type": "textAssetType@backgroundMode",
     "required": false,
     "default": "block"
    },
    "backgroundPadding": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "backgroundRadius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "emoji": {
     "type": "textAssetType@emoji",
     "required": false,
     "default": "color"
    },
    "font": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "fontFile": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "fontAsset": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "fallback": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "weight": {
     "type": "fontWeightType",
     "required": false,
     "default": null
    },
    "fontStyle": {
     "type": "fontStyleType",
     "required": false,
     "default": null
    },
    "stretch": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "variation": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "features": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "strokeColor": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "strokeWidth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "strokePosition": {
     "type": "strokePositionType",
     "required": false,
     "default": null
    },
    "shadowColor": {
     "type": "colorType",
     "required": false,
     "default": null
    },
    "shadowOffsetX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "shadowOffsetY": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "shadowBlur": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "baselineShift": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "tracking": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "textTransform": {
     "type": "characterStyle@textTransform",
     "required": false,
     "default": null
    },
    "decoration": {
     "type": "characterStyle@decoration",
     "required": false,
     "default": null
    },
    "highlight": {
     "type": "paintType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "span",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "span": "spanType"
    }
   }
  },
  "vectorAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "shape": {
     "type": "vectorAssetType@shape",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "fill": {
     "type": "paintType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "path": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "fillRule": {
     "type": "fillRuleType",
     "required": false,
     "default": "evenodd"
    },
    "stroke": {
     "type": "paintType",
     "required": false,
     "default": "#00000000"
    },
    "strokeWidth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "radius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "points": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "5"
    },
    "innerRadius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "strokeCap": {
     "type": "strokeCapType",
     "required": false,
     "default": "butt"
    },
    "strokeJoin": {
     "type": "strokeJoinType",
     "required": false,
     "default": "miter"
    },
    "miterLimit": {
     "type": "positiveDecimal",
     "required": false,
     "default": "4"
    },
    "dash": {
     "type": "numberListType",
     "required": false,
     "default": null
    },
    "dashOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "strokePosition": {
     "type": "strokePositionType",
     "required": false,
     "default": "center"
    },
    "paintOrder": {
     "type": "strokeStyle@paintOrder",
     "required": false,
     "default": "fill-stroke"
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "meshAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "format": {
     "type": "meshAssetType@format",
     "required": false,
     "default": null
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "slotType": {
   "attributes": {
    "id": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "value": {
     "type": "xs:string",
     "required": true,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "lottieAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "animation": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "segment": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "slot",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "slot": "slotType"
    }
   }
  },
  "fontAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "family": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "weight": {
     "type": "fontWeightType",
     "required": false,
     "default": "400"
    },
    "fontStyle": {
     "type": "fontStyleType",
     "required": false,
     "default": "normal"
    },
    "collectionIndex": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "credit": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proxy": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "generatorAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "kind": {
     "type": "generatorAssetType@kind",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "paint": {
     "type": "paintType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "paint2": {
     "type": "paintType",
     "required": false,
     "default": "#000000FF"
    },
    "scale": {
     "type": "positiveDecimal",
     "required": false,
     "default": "100"
    },
    "octaves": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "4"
    },
    "evolution": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "contrast": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "angle": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "chartSeriesType": {
   "attributes": {
    "name": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "values": {
     "type": "numberListType",
     "required": true,
     "default": null
    },
    "color": {
     "type": "paintType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "chartAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "kind": {
     "type": "chartAssetType@kind",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "labels": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "textStyle": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "progress": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "showAxes": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "showValues": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "format": {
     "type": "xs:string",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "series",
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "series": "chartSeriesType",
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "audiogramAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "source": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "style": {
     "type": "audiogramAssetType@style",
     "required": false,
     "default": "bars"
    },
    "bars": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "48"
    },
    "color": {
     "type": "paintType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "smoothing": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "codeAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "kind": {
     "type": "codeAssetType@kind",
     "required": true,
     "default": null
    },
    "data": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "foreground": {
     "type": "colorType",
     "required": false,
     "default": "#000000FF"
    },
    "background": {
     "type": "colorType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "errorCorrection": {
     "type": "codeAssetType@errorCorrection",
     "required": false,
     "default": "M"
    },
    "quietZone": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "4"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "formulaAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "tex": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "size": {
     "type": "positiveDecimal",
     "required": false,
     "default": "48"
    },
    "color": {
     "type": "paintType",
     "required": false,
     "default": "#FFFFFFFF"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "generatedAssetType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "kind": {
     "type": "generatedAssetType@kind",
     "required": true,
     "default": null
    },
    "provider": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "model": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "prompt": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "voice": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "language": {
     "type": "languageTagType",
     "required": false,
     "default": null
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "cache": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "cacheSha256": {
     "type": "sha256Type",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "fps": {
     "type": "fpsType",
     "required": false,
     "default": null
    },
    "duration": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "license": {
     "type": "xs:string",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "assetsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "image",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "video",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "imageSequence",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "audio",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "text",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "vector",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "mesh",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "lottie",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "font",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "generator",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "chart",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "audiogram",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "code",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "formula",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "generated",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "image": "imageAssetType",
     "video": "videoAssetType",
     "imageSequence": "imageSequenceAssetType",
     "audio": "audioAssetType",
     "text": "textAssetType",
     "vector": "vectorAssetType",
     "mesh": "meshAssetType",
     "lottie": "lottieAssetType",
     "font": "fontAssetType",
     "generator": "generatorAssetType",
     "chart": "chartAssetType",
     "audiogram": "audiogramAssetType",
     "code": "codeAssetType",
     "formula": "formulaAssetType",
     "generated": "generatedAssetType"
    }
   }
  },
  "materialType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "baseColor": {
     "type": "colorType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "metallic": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "roughness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "emissive": {
     "type": "colorType",
     "required": false,
     "default": "#000000FF"
    },
    "emissiveStrength": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "1"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "alphaMode": {
     "type": "materialType@alphaMode",
     "required": false,
     "default": "opaque"
    },
    "alphaCutoff": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "doubleSided": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "unlit": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "clearcoat": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "clearcoatRoughness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "transmission": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "ior": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1.5"
    },
    "thickness": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "attenuationColor": {
     "type": "colorType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "attenuationDistance": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "sheenColor": {
     "type": "colorType",
     "required": false,
     "default": "#000000FF"
    },
    "sheenRoughness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "specular": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "specularColor": {
     "type": "colorType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "iridescence": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "iridescenceIor": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1.3"
    },
    "anisotropy": {
     "type": "signedUnitDecimal",
     "required": false,
     "default": "0"
    },
    "anisotropyRotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "dispersion": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "baseColorMap": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "normalMap": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "normalScale": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "metallicRoughnessMap": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "occlusionMap": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "emissiveMap": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "displacementMap": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "displacementScale": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "uvScaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "uvScaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "materialX": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "materialsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "material",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "material": "materialType"
    }
   }
  },
  "warpPointType": {
   "attributes": {
    "row": {
     "type": "xs:nonNegativeInteger",
     "required": true,
     "default": null
    },
    "col": {
     "type": "xs:nonNegativeInteger",
     "required": true,
     "default": null
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "puppetPinType": {
   "attributes": {
    "name": {
     "type": "xs:NMTOKEN",
     "required": false,
     "default": null
    },
    "kind": {
     "type": "puppetPinType@kind",
     "required": false,
     "default": "position"
    },
    "restX": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "restY": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "amount": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "modifierType": {
   "attributes": {
    "type": {
     "type": "modifierType@type",
     "required": true,
     "default": null
    },
    "amount": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "frequency": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "phase": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "axis": {
     "type": "xs:string",
     "required": false,
     "default": "y"
    },
    "rows": {
     "type": "gridSizeType",
     "required": false,
     "default": "4"
    },
    "cols": {
     "type": "gridSizeType",
     "required": false,
     "default": "4"
    },
    "centerX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "centerY": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "radius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "skeleton": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "corners": {
     "type": "numberListType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "point",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "pin",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "point": "warpPointType",
     "pin": "puppetPinType"
    }
   }
  },
  "deformType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "modifier",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "modifier": "modifierType"
    }
   }
  },
  "boneType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "length": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "skeletonType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "weights": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "bone",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "transformConstraint",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "bone": "boneType",
     "transformConstraint": "transformConstraintType"
    }
   }
  },
  "rigidBodyType": {
   "attributes": {
    "type": {
     "type": "rigidBodyType@type",
     "required": false,
     "default": "dynamic"
    },
    "shape": {
     "type": "xs:string",
     "required": false,
     "default": "box"
    },
    "path": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "mass": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "friction": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "restitution": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "linearDamping": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.01"
    },
    "angularDamping": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.01"
    },
    "velocityX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "velocityY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "angularVelocity": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "radius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "collisionGroup": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "collidesWith": {
     "type": "xs:string",
     "required": false,
     "default": "all"
    },
    "sensor": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "fixedRotation": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "bullet": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "activateAt": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "softBodyType": {
   "attributes": {
    "mass": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "stiffness": {
     "type": "positiveDecimal",
     "required": false,
     "default": "20"
    },
    "damping": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.1"
    },
    "pressure": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rows": {
     "type": "gridSizeType",
     "required": false,
     "default": "4"
    },
    "cols": {
     "type": "gridSizeType",
     "required": false,
     "default": "4"
    },
    "pin": {
     "type": "softBodyType@pin",
     "required": false,
     "default": "none"
    },
    "kind": {
     "type": "softBodyType@kind",
     "required": false,
     "default": "jelly"
    },
    "selfCollision": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "textAnimatorType": {
   "attributes": {
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "preset": {
     "type": "textAnimatorType@preset",
     "required": false,
     "default": null
    },
    "presetStart": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "presetDuration": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "unit": {
     "type": "textAnimatorType@unit",
     "required": false,
     "default": "character"
    },
    "span": {
     "type": "xs:NMTOKEN",
     "required": false,
     "default": null
    },
    "selector": {
     "type": "textAnimatorType@selector",
     "required": false,
     "default": "range"
    },
    "rangeUnits": {
     "type": "textAnimatorType@rangeUnits",
     "required": false,
     "default": "percent"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": "100"
    },
    "offset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "amount": {
     "type": "percentType",
     "required": false,
     "default": "100"
    },
    "shape": {
     "type": "textAnimatorType@shape",
     "required": false,
     "default": "square"
    },
    "smoothness": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "easeHigh": {
     "type": "percentType",
     "required": false,
     "default": "0"
    },
    "easeLow": {
     "type": "percentType",
     "required": false,
     "default": "0"
    },
    "order": {
     "type": "textAnimatorType@order",
     "required": false,
     "default": "forward"
    },
    "stagger": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "overlap": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "wiggleRate": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "2"
    },
    "combine": {
     "type": "textAnimatorType@combine",
     "required": false,
     "default": "add"
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "scale": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "skew": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": null
    },
    "fill": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "stroke": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "strokeWidth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "tracking": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "lineSpacing": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "blur": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "baselineShift": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "characterOffset": {
     "type": "xs:integer",
     "required": false,
     "default": null
    },
    "variation": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "anchorX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "anchorY": {
     "type": "xs:double",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "textPathType": {
   "attributes": {
    "path": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "startOffset": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "firstMargin": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "lastMargin": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "reverse": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "perpendicular": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "forceAlignment": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "shapeModifierType": {
   "attributes": {
    "type": {
     "type": "shapeModifierType@type",
     "required": true,
     "default": null
    },
    "copies": {
     "type": "xs:double",
     "required": false,
     "default": "3"
    },
    "offset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "amount": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "size": {
     "type": "xs:double",
     "required": false,
     "default": "10"
    },
    "ridges": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "5"
    },
    "frequency": {
     "type": "xs:double",
     "required": false,
     "default": "2"
    },
    "detail": {
     "type": "xs:double",
     "required": false,
     "default": "10"
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "mode": {
     "type": "xs:NMTOKEN",
     "required": false,
     "default": null
    },
    "offsetX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "offsetY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scale": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "startOpacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "endOpacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "composite": {
     "type": "shapeModifierType@composite",
     "required": false,
     "default": "above"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "layerType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "asset": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    },
    "effects": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "clipIn": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "clipOut": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "loop": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "reverse": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "speed": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "timeStretch": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "freezeAt": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "frameBlend": {
     "type": "layerType@frameBlend",
     "required": false,
     "default": "none"
    },
    "fit": {
     "type": "fitType",
     "required": false,
     "default": "none"
    },
    "boxWidth": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "boxHeight": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "focusX": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "focusY": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "cropLeft": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "cropTop": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "cropRight": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "cropBottom": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "flipX": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "flipY": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "stabilize": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "stabilizeSmoothness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "volume": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "mute": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "audioBus": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "rigidBody",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "softBody",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "deform",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "timeRemap",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "textAnimator",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "textPath",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "rigidBody": "rigidBodyType",
     "softBody": "softBodyType",
     "deform": "deformType",
     "timeRemap": "timeRemapType",
     "textAnimator": "textAnimatorType",
     "textPath": "textPathType"
    }
   }
  },
  "shapeType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "shape": {
     "type": "shapeType@shape",
     "required": true,
     "default": null
    },
    "width": {
     "type": "positiveLengthType",
     "required": true,
     "default": null
    },
    "height": {
     "type": "positiveLengthType",
     "required": true,
     "default": null
    },
    "path": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "fillRule": {
     "type": "fillRuleType",
     "required": false,
     "default": "nonzero"
    },
    "radius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "cornerRadii": {
     "type": "numberListType",
     "required": false,
     "default": null
    },
    "points": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "5"
    },
    "innerRadius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "outerRadius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "innerRoundness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "outerRoundness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "fill": {
     "type": "paintType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "stroke": {
     "type": "paintType",
     "required": false,
     "default": "#00000000"
    },
    "strokeWidth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    },
    "effects": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "strokeCap": {
     "type": "strokeCapType",
     "required": false,
     "default": "butt"
    },
    "strokeJoin": {
     "type": "strokeJoinType",
     "required": false,
     "default": "miter"
    },
    "miterLimit": {
     "type": "positiveDecimal",
     "required": false,
     "default": "4"
    },
    "dash": {
     "type": "numberListType",
     "required": false,
     "default": null
    },
    "dashOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "strokePosition": {
     "type": "strokePositionType",
     "required": false,
     "default": "center"
    },
    "paintOrder": {
     "type": "strokeStyle@paintOrder",
     "required": false,
     "default": "fill-stroke"
    },
    "trimStart": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "trimEnd": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "trimOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "trimMode": {
     "type": "trimPath@trimMode",
     "required": false,
     "default": "simultaneous"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "rigidBody",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "softBody",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "deform",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "shapeModifier",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "rigidBody": "rigidBodyType",
     "softBody": "softBodyType",
     "deform": "deformType",
     "shapeModifier": "shapeModifierType"
    }
   }
  },
  "burstType": {
   "attributes": {
    "time": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "count": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "repeat": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "interval": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "particleEmitterType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "preset": {
     "type": "particleEmitterType@preset",
     "required": false,
     "default": null
    },
    "rate": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "10"
    },
    "lifetime": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "lifetimeVariance": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "speed": {
     "type": "xs:double",
     "required": false,
     "default": "100"
    },
    "speedVariance": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "direction": {
     "type": "xs:double",
     "required": false,
     "default": "-90"
    },
    "spread": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "gravityX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "gravityY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "drag": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "turbulence": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "turbulenceScale": {
     "type": "positiveDecimal",
     "required": false,
     "default": "100"
    },
    "size": {
     "type": "positiveDecimal",
     "required": false,
     "default": "4"
    },
    "sizeEnd": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "sizeVariance": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "sizeCurve": {
     "type": "curveType",
     "required": false,
     "default": "linear"
    },
    "color": {
     "type": "paintType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "colorEnd": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "colorCurve": {
     "type": "curveType",
     "required": false,
     "default": "linear"
    },
    "opacityEnd": {
     "type": "unitDecimal",
     "required": false,
     "default": null
    },
    "rotation0": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationVariance": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "angularVelocity": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "angularVelocityVariance": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "orientToVelocity": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "maxParticles": {
     "type": "particleEmitterType@maxParticles",
     "required": false,
     "default": "10000"
    },
    "emitterShape": {
     "type": "particleEmitterType@emitterShape",
     "required": false,
     "default": "rect"
    },
    "emitterWidth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "emitterHeight": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "emitterPath": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "emitterAsset": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "shape": {
     "type": "particleEmitterType@shape",
     "required": false,
     "default": "disc"
    },
    "sprite": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "spriteCols": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "1"
    },
    "spriteRows": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "1"
    },
    "spriteFps": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "trail": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "forceFields": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "collide": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "bounce": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.3"
    },
    "preroll": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    },
    "effects": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "burst",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "burst": "burstType"
    }
   }
  },
  "object3DType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "primitive": {
     "type": "object3DType@primitive",
     "required": true,
     "default": null
    },
    "material": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "mesh": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "text": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "font": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "path": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "depth": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "10"
    },
    "bevel": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "width": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "height": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "segments": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "32"
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "z": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleZ": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "radius": {
     "type": "positiveDecimal",
     "required": false,
     "default": "50"
    },
    "castShadow": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "receiveShadow": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "animationClip": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "animationSpeed": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "animationOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "morphWeights": {
     "type": "numberListType",
     "required": false,
     "default": null
    },
    "materialVariant": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "instances": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "transformConstraint",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "transformConstraint": "transformConstraintType"
    }
   }
  },
  "shakeType": {
   "attributes": {
    "amplitude": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "10"
    },
    "frequency": {
     "type": "positiveDecimal",
     "required": false,
     "default": "2"
    },
    "rotation": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "zoom": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "octaves": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "2"
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "cameraType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "active": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "z": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "projection": {
     "type": "cameraType@projection",
     "required": false,
     "default": "perspective"
    },
    "fov": {
     "type": "positiveDecimal",
     "required": false,
     "default": "60"
    },
    "near": {
     "type": "positiveDecimal",
     "required": false,
     "default": "0.1"
    },
    "far": {
     "type": "positiveDecimal",
     "required": false,
     "default": "10000"
    },
    "yaw": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "pitch": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "roll": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "target": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "focalLength": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "sensorWidth": {
     "type": "positiveDecimal",
     "required": false,
     "default": "36"
    },
    "sensorHeight": {
     "type": "positiveDecimal",
     "required": false,
     "default": "24"
    },
    "orthoHeight": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "depthOfField": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "fStop": {
     "type": "positiveDecimal",
     "required": false,
     "default": "2.8"
    },
    "focusDistance": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1000"
    },
    "focusTarget": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "apertureBlades": {
     "type": "cameraType@apertureBlades",
     "required": false,
     "default": "0"
    },
    "shutterAngle": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "exposure": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "lensDistortion": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "shake",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "transformConstraint",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "shake": "shakeType",
     "transformConstraint": "transformConstraintType"
    }
   }
  },
  "groupType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    },
    "effects": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "isolate": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "collapse": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "width": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "height": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "clip": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "layout": {
     "type": "groupType@layout",
     "required": false,
     "default": "none"
    },
    "gap": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "padding": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "justify": {
     "type": "groupType@justify",
     "required": false,
     "default": "start"
    },
    "alignItems": {
     "type": "groupType@alignItems",
     "required": false,
     "default": "start"
    },
    "gridColumns": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "2"
    },
    "timeOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "timeScale": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "group",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "sequence",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "layer",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "shape",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "object3D",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "camera",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "particleEmitter",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "instance",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "include",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "repeat",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "adjustment",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transition",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "skeleton",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "group": "groupType",
     "sequence": "sequenceType",
     "layer": "layerType",
     "shape": "shapeType",
     "object3D": "object3DType",
     "camera": "cameraType",
     "particleEmitter": "particleEmitterType",
     "instance": "instanceType",
     "include": "includeType",
     "repeat": "repeatType",
     "adjustment": "adjustmentType",
     "transition": "transitionType",
     "skeleton": "skeletonType"
    }
   }
  },
  "sequenceType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    },
    "effects": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "isolate": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "collapse": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "width": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "height": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "clip": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "layout": {
     "type": "groupType@layout",
     "required": false,
     "default": "none"
    },
    "gap": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "padding": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "justify": {
     "type": "groupType@justify",
     "required": false,
     "default": "start"
    },
    "alignItems": {
     "type": "groupType@alignItems",
     "required": false,
     "default": "start"
    },
    "gridColumns": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "2"
    },
    "timeOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "timeScale": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "timeGap": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "transition": {
     "type": "xs:NMTOKEN",
     "required": false,
     "default": null
    },
    "transitionDuration": {
     "type": "positiveDecimal",
     "required": false,
     "default": "0.5"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "group",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "sequence",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "layer",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "shape",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "object3D",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "camera",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "particleEmitter",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "instance",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "include",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "repeat",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "adjustment",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transition",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "skeleton",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "group": "groupType",
     "sequence": "sequenceType",
     "layer": "layerType",
     "shape": "shapeType",
     "object3D": "object3DType",
     "camera": "cameraType",
     "particleEmitter": "particleEmitterType",
     "instance": "instanceType",
     "include": "includeType",
     "repeat": "repeatType",
     "adjustment": "adjustmentType",
     "transition": "transitionType",
     "skeleton": "skeletonType"
    }
   }
  },
  "instanceType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "symbol": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    },
    "effects": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "clipIn": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "clipOut": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "loop": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "reverse": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "speed": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "fit": {
     "type": "fitType",
     "required": false,
     "default": "none"
    },
    "boxWidth": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    },
    "boxHeight": {
     "type": "positiveLengthType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "override",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "timeRemap",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "override": "overrideType",
     "timeRemap": "timeRemapType"
    }
   }
  },
  "includeType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "symbol": {
     "type": "xs:NCName",
     "required": false,
     "default": null
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "override",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "override": "overrideType"
    }
   }
  },
  "repeatType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "count": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": null
    },
    "over": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "var": {
     "type": "xs:NCName",
     "required": false,
     "default": "item"
    },
    "from": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "step": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "1"
    },
    "offsetX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "offsetY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationStep": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleStep": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "opacityStep": {
     "type": "unitDecimal",
     "required": false,
     "default": "0"
    },
    "timeStep": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "group",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "sequence",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "layer",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "shape",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "object3D",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "camera",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "particleEmitter",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "instance",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "include",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "repeat",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "adjustment",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transition",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "skeleton",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType",
     "group": "groupType",
     "sequence": "sequenceType",
     "layer": "layerType",
     "shape": "shapeType",
     "object3D": "object3DType",
     "camera": "cameraType",
     "particleEmitter": "particleEmitterType",
     "instance": "instanceType",
     "include": "includeType",
     "repeat": "repeatType",
     "adjustment": "adjustmentType",
     "transition": "transitionType",
     "skeleton": "skeletonType"
    }
   }
  },
  "adjustmentType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "tags": {
     "type": "xs:NMTOKENS",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "0"
    },
    "visible": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "opacity": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "endMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "condition": {
     "type": "expressionString",
     "required": false,
     "default": null
    },
    "parent": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "triStateType",
     "required": false,
     "default": "inherit"
    },
    "threeD": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "zDepth": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "rotationY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "matteMode": {
     "type": "matteModeType",
     "required": false,
     "default": "alpha"
    },
    "matteVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "alignX": {
     "type": "nodeAttributes@alignX",
     "required": false,
     "default": null
    },
    "alignY": {
     "type": "nodeAttributes@alignY",
     "required": false,
     "default": null
    },
    "alignTo": {
     "type": "nodeAttributes@alignTo",
     "required": false,
     "default": "parent"
    },
    "margin": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "rotation": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "scaleX": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "scaleY": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "anchorX": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "anchorY": {
     "type": "lengthType",
     "required": false,
     "default": "0"
    },
    "skewX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "skewY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "effects": {
     "type": "xs:IDREFS",
     "required": true,
     "default": null
    },
    "blend": {
     "type": "blendType",
     "required": false,
     "default": "normal"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "choice",
         "items": [
          {
           "kind": "element",
           "name": "animate",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "expression",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "motionPath",
           "min": 1,
           "max": 1
          },
          {
           "kind": "element",
           "name": "link",
           "min": 1,
           "max": 1
          }
         ],
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "mask",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "transformConstraint",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "mask": "maskType",
     "transformConstraint": "transformConstraintType"
    }
   }
  },
  "transitionType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": false,
     "default": null
    },
    "type": {
     "type": "transitionType@type",
     "required": true,
     "default": null
    },
    "from": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "to": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "duration": {
     "type": "positiveDecimal",
     "required": false,
     "default": "0.5"
    },
    "alignment": {
     "type": "transitionType@alignment",
     "required": false,
     "default": "center"
    },
    "curve": {
     "type": "curveType",
     "required": false,
     "default": "ease-in-out"
    },
    "direction": {
     "type": "transitionType@direction",
     "required": false,
     "default": "left"
    },
    "angle": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "color": {
     "type": "colorType",
     "required": false,
     "default": "#000000FF"
    },
    "softness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.1"
    },
    "matte": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "shader": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "motionBlur": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "audio": {
     "type": "transitionType@audio",
     "required": false,
     "default": "crossfade"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "param",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "param": "paramValueType"
    }
   }
  },
  "compositionType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "group",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "sequence",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "layer",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "shape",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "object3D",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "camera",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "particleEmitter",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "instance",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "include",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "repeat",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "adjustment",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "transition",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "skeleton",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "group": "groupType",
     "sequence": "sequenceType",
     "layer": "layerType",
     "shape": "shapeType",
     "object3D": "object3DType",
     "camera": "cameraType",
     "particleEmitter": "particleEmitterType",
     "instance": "instanceType",
     "include": "includeType",
     "repeat": "repeatType",
     "adjustment": "adjustmentType",
     "transition": "transitionType",
     "skeleton": "skeletonType"
    }
   }
  },
  "symbolType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "name": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "duration": {
     "type": "durationType",
     "required": false,
     "default": null
    },
    "background": {
     "type": "paintType",
     "required": false,
     "default": "#00000000"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "group",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "sequence",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "layer",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "shape",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "object3D",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "camera",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "particleEmitter",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "instance",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "include",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "repeat",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "adjustment",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "transition",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "skeleton",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "group": "groupType",
     "sequence": "sequenceType",
     "layer": "layerType",
     "shape": "shapeType",
     "object3D": "object3DType",
     "camera": "cameraType",
     "particleEmitter": "particleEmitterType",
     "instance": "instanceType",
     "include": "includeType",
     "repeat": "repeatType",
     "adjustment": "adjustmentType",
     "transition": "transitionType",
     "skeleton": "skeletonType"
    }
   }
  },
  "symbolsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "symbol",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "symbol": "symbolType"
    }
   }
  },
  "effectType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "type": {
     "type": "effectType@type",
     "required": true,
     "default": null
    },
    "enabled": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "mix": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "intensity": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "radius": {
     "type": "effectRadiusType",
     "required": false,
     "default": "4"
    },
    "threshold": {
     "type": "xs:double",
     "required": false,
     "default": "0.7"
    },
    "saturation": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "contrast": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "brightness": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "color": {
     "type": "colorType",
     "required": false,
     "default": null
    },
    "paint": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "offsetX": {
     "type": "effectOffsetType",
     "required": false,
     "default": "8"
    },
    "offsetY": {
     "type": "effectOffsetType",
     "required": false,
     "default": "8"
    },
    "lights": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "falloff": {
     "type": "effectType@falloff",
     "required": false,
     "default": "smooth"
    },
    "relief": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "angle": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "amount": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "size": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "1"
    },
    "frequency": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "speed": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "centerX": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "centerY": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "samples": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "16"
    },
    "lift": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "gamma": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "gain": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "slope": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "offset": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "power": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "temperature": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "tint": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "exposure": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "hue": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "channel": {
     "type": "effectType@channel",
     "required": false,
     "default": "rgb"
    },
    "curve": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "inputBlack": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "inputWhite": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "outputBlack": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "outputWhite": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "levels": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "8"
    },
    "keyColor": {
     "type": "colorType",
     "required": false,
     "default": null
    },
    "tolerance": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.2"
    },
    "softness": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.1"
    },
    "spill": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "source": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "space": {
     "type": "colorSpaceType",
     "required": false,
     "default": null
    },
    "tonemapper": {
     "type": "effectType@tonemapper",
     "required": false,
     "default": "aces"
    },
    "position": {
     "type": "effectType@position",
     "required": false,
     "default": "outside"
    },
    "compositeOriginal": {
     "type": "effectType@compositeOriginal",
     "required": false,
     "default": "behind"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "param",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "param": "paramValueType"
    }
   }
  },
  "effectsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "effect",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "effect": "effectType"
    }
   }
  },
  "lightType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "type": {
     "type": "lightType@type",
     "required": true,
     "default": null
    },
    "color": {
     "type": "colorType",
     "required": false,
     "default": "#FFFFFFFF"
    },
    "colorTemperature": {
     "type": "kelvinType",
     "required": false,
     "default": null
    },
    "intensity": {
     "type": "lightIntensityType",
     "required": false,
     "default": "1"
    },
    "exposure": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "range": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "falloff": {
     "type": "positiveDecimal",
     "required": false,
     "default": "2"
    },
    "spotAngle": {
     "type": "spotAngleType",
     "required": false,
     "default": "45"
    },
    "innerConeAngle": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "castShadow": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "shadowSoftness": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "shadowBias": {
     "type": "xs:double",
     "required": false,
     "default": "0.0005"
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "z": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "yaw": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "pitch": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "roll": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "width": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "height": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "radius": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "ies": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "environment": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "environmentVisible": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "affectsDiffuse": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "affectsSpecular": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "shadowMapSize": {
     "type": "lightType@shadowMapSize",
     "required": false,
     "default": "2048"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "transformConstraint",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "transformConstraint": "transformConstraintType"
    }
   }
  },
  "lightsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "light",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "light": "lightType"
    }
   }
  },
  "forceFieldType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "type": {
     "type": "forceFieldType@type",
     "required": true,
     "default": null
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "forceX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "forceY": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "strength": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "falloff": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "radius": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "scale": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "path": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": null
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "affects": {
     "type": "forceFieldType@affects",
     "required": false,
     "default": "all"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "animate",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "expression",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "motionPath",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "link",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType"
    }
   }
  },
  "constraintType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "type": {
     "type": "constraintType@type",
     "required": true,
     "default": null
    },
    "a": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "b": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "x": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "y": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "restLength": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "stiffness": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "damping": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "minAngle": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "maxAngle": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "axisAngle": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "motorSpeed": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "maxForce": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "breakForce": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "physicsType": {
   "attributes": {
    "fixedStep": {
     "type": "positiveDecimal",
     "required": false,
     "default": "0.008333333333333333"
    },
    "gravityX": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "gravityY": {
     "type": "xs:double",
     "required": false,
     "default": "-9.80665"
    },
    "pixelsPerMeter": {
     "type": "positiveDecimal",
     "required": false,
     "default": "100"
    },
    "solverIterations": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "8"
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "bounds": {
     "type": "physicsType@bounds",
     "required": false,
     "default": "none"
    },
    "cache": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "cacheSha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "forceField",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "constraint",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "forceField": "forceFieldType",
     "constraint": "constraintType"
    }
   }
  },
  "trackDataType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "kind": {
     "type": "trackDataType@kind",
     "required": true,
     "default": null
    },
    "format": {
     "type": "trackDataType@format",
     "required": false,
     "default": "json"
    },
    "footage": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "timeOffset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "trackingType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "trackData",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "trackData": "trackDataType"
    }
   }
  },
  "eqBandType": {
   "attributes": {
    "kind": {
     "type": "eqBandType@kind",
     "required": false,
     "default": "peak"
    },
    "frequency": {
     "type": "positiveDecimal",
     "required": true,
     "default": null
    },
    "gain": {
     "type": "decibelType",
     "required": false,
     "default": "0"
    },
    "q": {
     "type": "positiveDecimal",
     "required": false,
     "default": "0.707"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "audioEffectType": {
   "attributes": {
    "type": {
     "type": "audioEffectType@type",
     "required": true,
     "default": null
    },
    "enabled": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "mix": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "frequency": {
     "type": "positiveDecimal",
     "required": false,
     "default": null
    },
    "gain": {
     "type": "decibelType",
     "required": false,
     "default": "0"
    },
    "threshold": {
     "type": "decibelType",
     "required": false,
     "default": "-18"
    },
    "ratio": {
     "type": "positiveDecimal",
     "required": false,
     "default": "4"
    },
    "attack": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0.01"
    },
    "release": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0.1"
    },
    "knee": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "3"
    },
    "time": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": null
    },
    "feedback": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.3"
    },
    "roomSize": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "width": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "1"
    },
    "semitones": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "amount": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "sidechain": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "band",
       "min": 1,
       "max": 1
      },
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "param",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "band": "eqBandType",
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "param": "paramValueType"
    }
   }
  },
  "audioTrackType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "asset": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "start": {
     "type": "audioSecondsType",
     "required": false,
     "default": "0"
    },
    "startMarker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "clipIn": {
     "type": "audioSecondsType",
     "required": false,
     "default": "0"
    },
    "clipOut": {
     "type": "audioSecondsType",
     "required": false,
     "default": null
    },
    "loop": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "volume": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "gain": {
     "type": "decibelType",
     "required": false,
     "default": "0"
    },
    "pan": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "fadeIn": {
     "type": "audioSecondsType",
     "required": false,
     "default": "0"
    },
    "fadeOut": {
     "type": "audioSecondsType",
     "required": false,
     "default": "0"
    },
    "fadeCurve": {
     "type": "audioTrackType@fadeCurve",
     "required": false,
     "default": "linear"
    },
    "speed": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "preservePitch": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "reverse": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "mute": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "role": {
     "type": "audioTrackType@role",
     "required": false,
     "default": "other"
    },
    "language": {
     "type": "languageTagType",
     "required": false,
     "default": null
    },
    "bus": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "fitToDuration": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "duckUnder": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "duckAmount": {
     "type": "decibelType",
     "required": false,
     "default": "-12"
    },
    "duckThreshold": {
     "type": "decibelType",
     "required": false,
     "default": "-40"
    },
    "duckAttack": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0.15"
    },
    "duckRelease": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0.4"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "audioEffect",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "audioEffect": "audioEffectType"
    }
   }
  },
  "busType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "volume": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "gain": {
     "type": "decibelType",
     "required": false,
     "default": "0"
    },
    "pan": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "output": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "mute": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "duckUnder": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "duckAmount": {
     "type": "decibelType",
     "required": false,
     "default": "-12"
    },
    "duckThreshold": {
     "type": "decibelType",
     "required": false,
     "default": "-40"
    },
    "duckAttack": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0.15"
    },
    "duckRelease": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0.4"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "audioEffect",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "audioEffect": "audioEffectType"
    }
   }
  },
  "masterType": {
   "attributes": {
    "volume": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    },
    "normalize": {
     "type": "masterType@normalize",
     "required": false,
     "default": "none"
    },
    "loudness": {
     "type": "lufsType",
     "required": false,
     "default": "-14"
    },
    "truePeak": {
     "type": "decibelType",
     "required": false,
     "default": "-1"
    },
    "limiter": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "dither": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "choice",
       "items": [
        {
         "kind": "element",
         "name": "animate",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "expression",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "motionPath",
         "min": 1,
         "max": 1
        },
        {
         "kind": "element",
         "name": "link",
         "min": 1,
         "max": 1
        }
       ],
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "audioEffect",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "animate": "animateType",
     "expression": "expressionType",
     "motionPath": "motionPathType",
     "link": "linkType",
     "audioEffect": "audioEffectType"
    }
   }
  },
  "audioMixType": {
   "attributes": {
    "sampleRate": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "48000"
    },
    "channels": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "2"
    },
    "channelLayout": {
     "type": "audioMixType@channelLayout",
     "required": false,
     "default": "auto"
    },
    "bitDepth": {
     "type": "audioMixType@bitDepth",
     "required": false,
     "default": "24"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "audioTrack",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "bus",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "master",
       "min": 1,
       "max": 1
      }
     ],
     "min": 1,
     "max": null
    },
    "elementTypes": {
     "audioTrack": "audioTrackType",
     "bus": "busType",
     "master": "masterType"
    }
   }
  },
  "wordType": {
   "attributes": {
    "start": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "end": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "text": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "emphasis": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "cueType": {
   "attributes": {
    "start": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "end": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "text": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "speaker": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "style": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "position": {
     "type": "xs:string",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "word",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "word": "wordType"
    }
   }
  },
  "captionTrackType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "language": {
     "type": "languageTagType",
     "required": true,
     "default": null
    },
    "label": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "kind": {
     "type": "captionTrackType@kind",
     "required": false,
     "default": "captions"
    },
    "src": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "format": {
     "type": "captionTrackType@format",
     "required": false,
     "default": null
    },
    "transcribe": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "cache": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "cacheSha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    },
    "mode": {
     "type": "captionTrackType@mode",
     "required": false,
     "default": "burn"
    },
    "preset": {
     "type": "captionTrackType@preset",
     "required": false,
     "default": "classic"
    },
    "style": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "activeStyle": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "activeColor": {
     "type": "paintType",
     "required": false,
     "default": null
    },
    "maxWordsPerLine": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "maxCharsPerLine": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "32"
    },
    "maxLines": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "2"
    },
    "x": {
     "type": "lengthType",
     "required": false,
     "default": "50%"
    },
    "y": {
     "type": "lengthType",
     "required": false,
     "default": "75%"
    },
    "width": {
     "type": "positiveLengthType",
     "required": false,
     "default": "85%"
    },
    "safeArea": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "z": {
     "type": "xs:int",
     "required": false,
     "default": "1000000"
    },
    "profanityFilter": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "cue",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "cue": "cueType"
    }
   }
  },
  "captionsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "captionTrack",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "captionTrack": "captionTrackType"
    }
   }
  },
  "markerType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": false,
     "default": null
    },
    "time": {
     "type": "xs:double",
     "required": true,
     "default": null
    },
    "duration": {
     "type": "nonNegativeDecimal",
     "required": false,
     "default": "0"
    },
    "kind": {
     "type": "markerType@kind",
     "required": false,
     "default": "cue"
    },
    "label": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "color": {
     "type": "colorType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "beatGridType": {
   "attributes": {
    "bpm": {
     "type": "positiveDecimal",
     "required": true,
     "default": null
    },
    "offset": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "beatsPerBar": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "4"
    },
    "source": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "markersType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "marker",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "beatGrid",
       "min": 1,
       "max": 1
      }
     ],
     "min": 1,
     "max": null
    },
    "elementTypes": {
     "marker": "markerType",
     "beatGrid": "beatGridType"
    }
   }
  },
  "paramType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "type": {
     "type": "paramType@type",
     "required": true,
     "default": null
    },
    "default": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "label": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "description": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "required": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "min": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "max": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "maxLength": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "pattern": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "options": {
     "type": "xs:string",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "bindType": {
   "attributes": {
    "param": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "target": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "property": {
     "type": "xs:NMTOKEN",
     "required": true,
     "default": null
    },
    "map": {
     "type": "xs:string",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "dataSourceType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "format": {
     "type": "dataSourceType@format",
     "required": false,
     "default": "json"
    },
    "sha256": {
     "type": "sha256Type",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "simple",
    "type": "xs:string"
   }
  },
  "setType": {
   "attributes": {
    "param": {
     "type": "xs:IDREF",
     "required": true,
     "default": null
    },
    "value": {
     "type": "xs:string",
     "required": true,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "variantType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "label": {
     "type": "xs:string",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "set",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "override",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "set": "setType",
     "override": "overrideType"
    }
   }
  },
  "parametersType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "param",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "bind",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "data",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "variant",
       "min": 1,
       "max": 1
      }
     ],
     "min": 1,
     "max": null
    },
    "elementTypes": {
     "param": "paramType",
     "bind": "bindType",
     "data": "dataSourceType",
     "variant": "variantType"
    }
   }
  },
  "safeAreaType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "preset": {
     "type": "safeAreaType@preset",
     "required": false,
     "default": "custom"
    },
    "top": {
     "type": "unitDecimal",
     "required": false,
     "default": null
    },
    "right": {
     "type": "unitDecimal",
     "required": false,
     "default": null
    },
    "bottom": {
     "type": "unitDecimal",
     "required": false,
     "default": null
    },
    "left": {
     "type": "unitDecimal",
     "required": false,
     "default": null
    },
    "enforce": {
     "type": "safeAreaType@enforce",
     "required": false,
     "default": "warn"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "safeAreasType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "safeArea",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "safeArea": "safeAreaType"
    }
   }
  },
  "layoutType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "aspect": {
     "type": "aspectType",
     "required": false,
     "default": null
    },
    "safeArea": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "reframe": {
     "type": "layoutType@reframe",
     "required": false,
     "default": "reflow"
    },
    "focusX": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    },
    "focusY": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.5"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "override",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "override": "overrideType"
    }
   }
  },
  "layoutsType": {
   "attributes": {},
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "layout",
       "min": 1,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "layout": "layoutType"
    }
   }
  },
  "lookType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": true,
     "default": null
    },
    "src": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "space": {
     "type": "colorSpaceType",
     "required": false,
     "default": "acescct"
    },
    "slope": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "offset": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "power": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "saturation": {
     "type": "xs:double",
     "required": false,
     "default": "1"
    },
    "mix": {
     "type": "unitDecimal",
     "required": false,
     "default": "1"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "colorManagementType": {
   "attributes": {
    "ocioConfig": {
     "type": "xs:anyURI",
     "required": false,
     "default": null
    },
    "workingSpace": {
     "type": "colorSpaceType",
     "required": false,
     "default": "linear-srgb"
    },
    "looks": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "display": {
     "type": "xs:string",
     "required": false,
     "default": "srgb"
    },
    "view": {
     "type": "xs:string",
     "required": false,
     "default": "standard"
    },
    "toneMapping": {
     "type": "colorManagementType@toneMapping",
     "required": false,
     "default": "none"
    },
    "exposure": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "bitDepth": {
     "type": "colorManagementType@bitDepth",
     "required": false,
     "default": "16f"
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "look",
       "min": 0,
       "max": null
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "look": "lookType"
    }
   }
  },
  "metaType": {
   "attributes": {
    "name": {
     "type": "xs:string",
     "required": true,
     "default": null
    },
    "value": {
     "type": "xs:string",
     "required": true,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "accessibilityType": {
   "attributes": {
    "description": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "audioDescription": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "requireCaptions": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "flashCheck": {
     "type": "accessibilityType@flashCheck",
     "required": false,
     "default": "warn"
    },
    "contrastCheck": {
     "type": "accessibilityType@contrastCheck",
     "required": false,
     "default": "off"
    },
    "minContrast": {
     "type": "positiveDecimal",
     "required": false,
     "default": "4.5"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "metadataType": {
   "attributes": {
    "title": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "author": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "description": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "keywords": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "copyright": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "revision": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "created": {
     "type": "xs:dateTime",
     "required": false,
     "default": null
    },
    "modified": {
     "type": "xs:dateTime",
     "required": false,
     "default": null
    },
    "generator": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "language": {
     "type": "languageTagType",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "meta",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "accessibility",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "meta": "metaType",
     "accessibility": "accessibilityType"
    }
   }
  },
  "scene360Type": {
   "attributes": {
    "layout": {
     "type": "scene360Type@layout",
     "required": false,
     "default": "equirectangular"
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "3840"
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "1920"
    },
    "viewportCamera": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "stereo": {
     "type": "scene360Type@stereo",
     "required": false,
     "default": "mono"
    },
    "interpupillary": {
     "type": "positiveDecimal",
     "required": false,
     "default": "0.064"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "projectType": {
   "attributes": {
    "width": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": true,
     "default": null
    },
    "fps": {
     "type": "fpsType",
     "required": true,
     "default": null
    },
    "duration": {
     "type": "durationType",
     "required": true,
     "default": null
    },
    "seed": {
     "type": "xs:unsignedLong",
     "required": false,
     "default": "0"
    },
    "linearLight": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "workingColorSpace": {
     "type": "colorSpaceType",
     "required": false,
     "default": "srgb"
    },
    "background": {
     "type": "paintType",
     "required": false,
     "default": "#000000FF"
    },
    "mode": {
     "type": "projectType@mode",
     "required": false,
     "default": "standard"
    },
    "antialias3d": {
     "type": "projectType@antialias3d",
     "required": false,
     "default": "1"
    },
    "motionBlur": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "shutterAngle": {
     "type": "projectType@shutterAngle",
     "required": false,
     "default": "180"
    },
    "shutterPhase": {
     "type": "xs:double",
     "required": false,
     "default": "-90"
    },
    "motionBlurSamples": {
     "type": "projectType@motionBlurSamples",
     "required": false,
     "default": "16"
    },
    "adaptiveMotionBlur": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "timecodeStart": {
     "type": "timecodeType",
     "required": false,
     "default": null
    },
    "pixelAspect": {
     "type": "positiveDecimal",
     "required": false,
     "default": "1"
    },
    "safeArea": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "quality": {
     "type": "projectType@quality",
     "required": false,
     "default": "final"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "stillType": {
   "attributes": {
    "time": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "marker": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "path": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "format": {
     "type": "stillType@format",
     "required": false,
     "default": "jpeg"
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "quality": {
     "type": "unitDecimal",
     "required": false,
     "default": "0.9"
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "destinationType": {
   "attributes": {
    "kind": {
     "type": "destinationType@kind",
     "required": true,
     "default": null
    },
    "uri": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "credentials": {
     "type": "xs:NMTOKEN",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "empty"
   }
  },
  "outputType": {
   "attributes": {
    "id": {
     "type": "xs:ID",
     "required": false,
     "default": null
    },
    "path": {
     "type": "xs:anyURI",
     "required": true,
     "default": null
    },
    "codec": {
     "type": "outputType@codec",
     "required": true,
     "default": null
    },
    "container": {
     "type": "outputType@container",
     "required": false,
     "default": null
    },
    "width": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "height": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "fps": {
     "type": "fpsType",
     "required": false,
     "default": null
    },
    "layout": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "variant": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "start": {
     "type": "xs:double",
     "required": false,
     "default": "0"
    },
    "end": {
     "type": "xs:double",
     "required": false,
     "default": null
    },
    "pixelFormat": {
     "type": "xs:string",
     "required": false,
     "default": "yuv420p"
    },
    "preset": {
     "type": "xs:string",
     "required": false,
     "default": "medium"
    },
    "profile": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "level": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "proresProfile": {
     "type": "outputType@proresProfile",
     "required": false,
     "default": null
    },
    "crf": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "18"
    },
    "bitrate": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "maxBitrate": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "bufferSize": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "twoPass": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "keyframeInterval": {
     "type": "positiveDecimal",
     "required": false,
     "default": "2"
    },
    "bFrames": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": null
    },
    "faststart": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "alpha": {
     "type": "xs:boolean",
     "required": false,
     "default": "false"
    },
    "audioCodec": {
     "type": "xs:string",
     "required": false,
     "default": "aac"
    },
    "audioBitrate": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": "192000"
    },
    "audio": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "colorSpace": {
     "type": "colorSpaceType",
     "required": false,
     "default": "srgb"
    },
    "transfer": {
     "type": "transferType",
     "required": false,
     "default": "auto"
    },
    "colorRange": {
     "type": "outputType@colorRange",
     "required": false,
     "default": "limited"
    },
    "maxCLL": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": null
    },
    "maxFALL": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": null
    },
    "masteringDisplay": {
     "type": "xs:string",
     "required": false,
     "default": null
    },
    "sphericalMetadata": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "captions": {
     "type": "xs:IDREFS",
     "required": false,
     "default": null
    },
    "burnCaptions": {
     "type": "xs:IDREF",
     "required": false,
     "default": null
    },
    "loopCount": {
     "type": "xs:nonNegativeInteger",
     "required": false,
     "default": "0"
    },
    "maxFileSize": {
     "type": "xs:positiveInteger",
     "required": false,
     "default": null
    },
    "embedMetadata": {
     "type": "xs:boolean",
     "required": false,
     "default": "true"
    },
    "representation": {
     "type": "xs:NMTOKEN",
     "required": false,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "choice",
     "items": [
      {
       "kind": "element",
       "name": "poster",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "thumbnail",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "destination",
       "min": 1,
       "max": 1
      }
     ],
     "min": 0,
     "max": null
    },
    "elementTypes": {
     "poster": "stillType",
     "thumbnail": "stillType",
     "destination": "destinationType"
    }
   }
  },
  "/scene": {
   "attributes": {
    "version": {
     "type": "/scene@version",
     "required": true,
     "default": null
    }
   },
   "content": {
    "kind": "elements",
    "particle": {
     "kind": "sequence",
     "items": [
      {
       "kind": "element",
       "name": "project",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "metadata",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "parameters",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "styles",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "colorManagement",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "output",
       "min": 0,
       "max": null
      },
      {
       "kind": "element",
       "name": "layouts",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "safeAreas",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "assets",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "paints",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "materials",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "symbols",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "scene360",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "markers",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "tracking",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "composition",
       "min": 1,
       "max": 1
      },
      {
       "kind": "element",
       "name": "lights",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "effects",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "physics",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "audioMix",
       "min": 0,
       "max": 1
      },
      {
       "kind": "element",
       "name": "captions",
       "min": 0,
       "max": 1
      }
     ],
     "min": 1,
     "max": 1
    },
    "elementTypes": {
     "project": "projectType",
     "metadata": "metadataType",
     "parameters": "parametersType",
     "styles": "stylesType",
     "colorManagement": "colorManagementType",
     "output": "outputType",
     "layouts": "layoutsType",
     "safeAreas": "safeAreasType",
     "assets": "assetsType",
     "paints": "paintsType",
     "materials": "materialsType",
     "symbols": "symbolsType",
     "scene360": "scene360Type",
     "markers": "markersType",
     "tracking": "trackingType",
     "composition": "compositionType",
     "lights": "lightsType",
     "effects": "effectsType",
     "physics": "physicsType",
     "audioMix": "audioMixType",
     "captions": "captionsType"
    }
   }
  }
 }
};
