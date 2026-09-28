uniform float intensity;
vec4 effect(vec2 p) {
    vec4 source = getFromColor(p);
    float wave = 0.5 + 0.5 * sin(p.x * 12.0 + time * 2.0);
    vec3 tint = mix(vec3(0.05, 0.65, 0.55), vec3(0.35, 0.12, 0.7), wave);
    return vec4(mix(source.rgb, tint * source.a, intensity), source.a);
}
