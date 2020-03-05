export function clamp(value: number, min: number, max: number): number {
    value = Math.max(value, min);
    value = Math.min(value, max);
    return value;
}

export function degToRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

const worldSize = 2 ** 32;

export function projectGeoToMap(geoPoint: number[]): number[] {
    const worldHalf = worldSize / 2;
    const sin = Math.sin(degToRad(geoPoint[1]));

    const x = (geoPoint[0] * worldSize) / 360;
    const y = (Math.log((1 + sin) / (1 - sin)) * worldSize) / (4 * Math.PI);

    return [clamp(x, -worldHalf, worldHalf), clamp(y, -worldHalf, worldHalf), 0];
}

export function geoDistance(lngLat1: number[], lngLat2: number[]): number {
    const R = 6371000;
    const rad = Math.PI / 180;
    const lat1 = lngLat1[1] * rad;
    const lat2 = lngLat2[1] * rad;
    const sinDLat = Math.sin(((lngLat2[1] - lngLat1[1]) * rad) / 2);
    const sinDLon = Math.sin(((lngLat2[0] - lngLat1[0]) * rad) / 2);
    const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

export function parseQuery() {
    const res: { [key: string]: number } = {};
    location.search
        .slice(1)
        .split('&')
        .map((str) => str.split('='))
        .forEach((couple) => {
            res[couple[0]] = Number(couple[1]);
        });
    return res;
}

export function coordinatesPrecision(zoom: number): number {
    return Math.ceil((zoom * Math.LN2 + Math.log(256 / 360 / 0.5)) / Math.LN10);
}

export function throttle(fn: (...args: any[]) => void, time: number) {
    let lock = false;
    let savedArgs: any[] | undefined;

    function later() {
        lock = false;
        if (savedArgs) {
            wrapperFn(...savedArgs);
            savedArgs = undefined;
        }
    }

    function wrapperFn(...args: any[]) {
        if (lock) {
            savedArgs = args;
        } else {
            fn(...args);
            setTimeout(later, time);
            lock = true;
        }
    }

    return wrapperFn;
}
