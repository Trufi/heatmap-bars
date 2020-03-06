import * as dat from 'dat.gui';
import { Heat, HeatOptions } from './heat';
import { geoDistance, coordinatesPrecision, throttle, parseQuery } from './utils';

declare const mapgl: any;

const container = document.getElementById('map') as HTMLElement;

const defaultMapOptions = {
    center: [37.6202, 55.7535],
    zoom: 12.1,
    rotation: 20,
    pitch: 30,
};

const map = ((window as any).map = new mapgl.Map(container, {
    ...defaultMapOptions,
    key: '042b5b75-f847-4f2a-b695-b5f58adc9dfd',
    zoomControl: false,
}));

const pointsPromise = fetch('./assets/data.csv')
    .then((res) => res.text())
    .then((res) => {
        const rows = res.split('\n').slice(1);
        return rows
            .map((str) => str.split(',').map(Number))
            .filter((point) => !point.some(Number.isNaN));
    });

const heatmap = new Heat(map, container);

const defaultHeatOptions: HeatOptions = {
    size: 1.4,
    height: 500000,
    faces: 4,
    opacity: 0.9,
    hueOfMinValue: 240,
    hueOfMaxValue: 0,
    saturation: 0.5,
    light: 0.5,
    lightAngle: 30,
    lightInfluence: 0.5,
    gridStepSize: 50000,
    gridMinPercentile: 0.01,
    gridMaxPercentile: 0.95,
};
const heatOptions: HeatOptions = { ...defaultHeatOptions };
heatmap.setOptions(heatOptions);

const defaultfilterConfig = {
    radius: 10000,
};
const filterConfig = { ...defaultfilterConfig };

function setData() {
    pointsPromise.then((points) => {
        const nearestPoints = points.filter(
            (point) => geoDistance(defaultMapOptions.center, point) < filterConfig.radius,
        );
        heatmap.setData(nearestPoints);
    });
}
setData();

const round = (x: number) => String(Math.round(x * 100) / 100);

const updateUrl = throttle(() => {
    const mapOptions = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        rotation: map.getRotation(),
        pitch: map.getPitch(),
    };

    const params: string[][] = [];

    if (
        mapOptions.center[0] !== defaultMapOptions.center[0] &&
        mapOptions.center[1] !== defaultMapOptions.center[1]
    ) {
        const precision = coordinatesPrecision(mapOptions.zoom);
        params.push(
            ['lng', mapOptions.center[0].toFixed(precision)],
            ['lat', mapOptions.center[1].toFixed(precision)],
        );
    }

    [
        [mapOptions, defaultMapOptions],
        [heatOptions, defaultHeatOptions],
        [filterConfig, defaultfilterConfig],
    ].forEach((pair: any) => {
        const [currentOpts, defaultOpts] = pair;
        for (const key in currentOpts) {
            if (key !== 'center' && currentOpts[key] !== defaultOpts[key]) {
                params.push([key, round(currentOpts[key])]);
            }
        }
    });

    const url = params.reduce((string, param, index) => {
        return string + (index === 0 ? '?' : '&') + param[0] + '=' + param[1];
    }, '');

    history.replaceState({}, document.title, url);
}, 500);

function restoreFromUrl() {
    const query = parseQuery();
    map.setCenter([query.lng, query.lat], { animate: false });
    map.setZoom(query.zoom, { animate: false });
    map.setRotation(query.rotation, { animate: false });
    map.setPitch(query.pitch, { animate: false });
    for (const key in heatOptions) {
        if (query[key] !== undefined && !Number.isNaN(query[key])) {
            (heatOptions as any)[key] = query[key];
        }
    }
    for (const key in filterConfig) {
        if (query[key] !== undefined && !Number.isNaN(query[key])) {
            (filterConfig as any)[key] = query[key];
        }
    }
    heatmap.setOptions(heatOptions);
    setData();
}
restoreFromUrl();
map.on('moveend', updateUrl);

const update = throttle(() => {
    heatmap.setOptions(heatOptions);
    updateUrl();
}, 50);

const gui = new dat.GUI();
const formFolder = gui.addFolder('Form');
formFolder.add(heatOptions, 'size', 0, 2).onChange(update);
formFolder.add(heatOptions, 'height', 0, 1000000, 1).onChange(update);
formFolder.add(heatOptions, 'faces', 2, 20, 1).onChange(update);

const colorFolder = gui.addFolder('Color');
colorFolder.add(heatOptions, 'hueOfMinValue', 0, 360, 1).onChange(update);
colorFolder.add(heatOptions, 'hueOfMaxValue', 0, 360, 1).onChange(update);
colorFolder.add(heatOptions, 'saturation', 0, 1, 0.01).onChange(update);
colorFolder.add(heatOptions, 'light', 0, 1, 0.01).onChange(update);
colorFolder.add(heatOptions, 'opacity', 0, 1, 0.01).onChange(update);

const lightFolder = gui.addFolder('Light');
lightFolder.add(heatOptions, 'lightAngle', 0, 360, 1).onChange(update);
lightFolder.add(heatOptions, 'lightInfluence', 0, 1, 0.01).onChange(update);

const gridFolder = gui.addFolder('Grid');
gridFolder.add(heatOptions, 'gridStepSize', 20000, 200000, 1).onChange(update);
gridFolder.add(heatOptions, 'gridMinPercentile', 0, 1, 0.01).onChange(update);
gridFolder.add(heatOptions, 'gridMaxPercentile', 0, 1, 0.01).onChange(update);

gridFolder.add(filterConfig, 'radius', 1, 50000, 1).onChange(
    throttle(() => {
        setData();
        updateUrl();
    }, 100),
);
