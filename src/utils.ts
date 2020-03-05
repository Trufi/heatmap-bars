export function hslToRgb(h: number, s: number, l: number) {
    // Achromatic
    if (s === 0) return [l, l, l];
    h /= 360;

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return [
        Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        Math.round(hueToRgb(p, q, h) * 255),
        Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    ];
}

/**
 * Helpers
 */

function hueToRgb(p: number, q: number, t: number) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;

    return p;
}

export function lerp(a: number, b: number, t: number) {
    return a + t * (b - a);
}

export function clamp(value: number, min: number, max: number): number {
    value = Math.max(value, min);
    value = Math.min(value, max);
    return value;
}

export function degToRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
    return (radians / Math.PI) * 180;
}

const worldSize = 2 ** 32;

export function projectGeoToMap(geoPoint: number[]): number[] {
    const worldHalf = worldSize / 2;
    const sin = Math.sin(degToRad(geoPoint[1]));

    const x = (geoPoint[0] * worldSize) / 360;
    const y = (Math.log((1 + sin) / (1 - sin)) * worldSize) / (4 * Math.PI);

    return [clamp(x, -worldHalf, worldHalf), clamp(y, -worldHalf, worldHalf), 0];
}

export function projectMapToGeo(mapPoint: number[]): number[] {
    const geoPoint = [0, 0];

    geoPoint[0] = (mapPoint[0] * 360) / worldSize;

    const latFactor = (-2 * Math.PI) / worldSize;
    geoPoint[1] = 90.0 - 2 * radToDeg(Math.atan(Math.exp(mapPoint[1] * latFactor)));

    return geoPoint;
}
