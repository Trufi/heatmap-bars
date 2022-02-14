export const vertexShaderSource = `
attribute vec3 a_position;
attribute vec2 a_offset;
attribute vec2 a_normal;
attribute float a_value;

uniform vec2 u_value_range;

uniform mat4 u_model;
uniform float u_height;
uniform float u_size;

uniform vec2 u_hue_range;
uniform vec2 u_saturation_range;
uniform vec2 u_light_range;
uniform float u_alpha;

uniform vec2 u_light_direction;
uniform float u_light_influence;

varying vec4 v_color;

float hueToRgb(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 0.166666) return p + (q - p) * 6.0 * t;
    if (t < 0.5) return q;
    if (t < 0.666666) return p + (q - p) * (0.666666 - t) * 6.0;

    return p;
}

vec3 hslToRgb(float h, float s, float l) {
    // Achromatic
    if (s == 0.0) return vec3(l, l, l);
    h /= 360.0;

    float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
    float p = 2.0 * l - q;

    return vec3(
        hueToRgb(p, q, h + 0.333333),
        hueToRgb(p, q, h),
        hueToRgb(p, q, h - 0.333333)
    );
}

void main(void) {
    float value = max(min(a_value, u_value_range.y), u_value_range.x);
    value = (value - u_value_range.x) / (u_value_range.y - u_value_range.x);

    float light_weight = 1.0 + u_light_influence * (abs(dot(u_light_direction, a_normal)) - 1.0);
    if (a_normal.x == 0.0 && a_normal.y == 0.0) {
        light_weight = 1.0;
    }

    float hue = mix(u_hue_range.x, u_hue_range.y, value);
    float saturation = mix(u_saturation_range.x, u_saturation_range.y, value);
    float light = mix(u_light_range.x, u_light_range.y, value);
    vec3 rgb = hslToRgb(hue, saturation, light);
    v_color = vec4(rgb * light_weight, u_alpha);

    gl_Position = u_model * vec4(
        vec2(a_position.xy + a_offset * u_size),
        a_position.z * u_height * value,
        1.0
    );
}
`;

export const fragmentShaderSource = `
precision mediump float;

varying vec4 v_color;

void main(void) {
    gl_FragColor = v_color;
}
`;
