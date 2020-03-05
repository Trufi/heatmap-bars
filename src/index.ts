import * as dat from 'dat.gui';
import { pointsToGrid } from './points';
import { projectGeoToMap } from './utils';
import { Heat, HeatOptions } from './heat';

declare const mapgl: any;

const container = document.getElementById('map') as HTMLElement;

const map = ((window as any).map = new mapgl.Map(container, {
    center: [37.62017, 55.753466],
    zoom: 12.1,
    rotation: 20,
    pitch: 30,
    key: '042b5b75-f847-4f2a-b695-b5f58adc9dfd',
    zoomControl: false,
}));

const heatmap = new Heat(map, container);

const gui = new dat.GUI();
const heatOptions: HeatOptions = {
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
};
heatmap.setOptions(heatOptions);

gui.add(heatOptions, 'size', 0, 2).onChange(() => heatmap.setOptions(heatOptions));
gui.add(heatOptions, 'height', 0, 1000000).onChange(() => heatmap.setOptions(heatOptions));
gui.add(heatOptions, 'faces', 2, 20, 1).onChange(() => heatmap.setOptions(heatOptions));

const colorFolder = gui.addFolder('Color');
colorFolder
    .add(heatOptions, 'hueOfMinValue', 0, 360)
    .onChange(() => heatmap.setOptions(heatOptions));
colorFolder
    .add(heatOptions, 'hueOfMaxValue', 0, 360)
    .onChange(() => heatmap.setOptions(heatOptions));
colorFolder.add(heatOptions, 'saturation', 0, 1).onChange(() => heatmap.setOptions(heatOptions));
colorFolder.add(heatOptions, 'light', 0, 1).onChange(() => heatmap.setOptions(heatOptions));
colorFolder.add(heatOptions, 'opacity', 0, 1).onChange(() => heatmap.setOptions(heatOptions));

const lightFolder = gui.addFolder('Light');
lightFolder.add(heatOptions, 'lightAngle', 0, 360).onChange(() => heatmap.setOptions(heatOptions));
lightFolder
    .add(heatOptions, 'lightInfluence', 0, 1)
    .onChange(() => heatmap.setOptions(heatOptions));

const bounds = [
    projectGeoToMap([37.53468263266983, 55.8057898485786]),
    projectGeoToMap([37.73449647407034, 55.680559093862406]),
];

fetch('./assets/data.csv')
    .then((res) => res.text())
    .then((res) => {
        const rows = res.split('\n').slice(1);
        let points = rows.map((str) => str.split(',').map(Number));
        for (let i = 0; i < 10; i++) {
            points.push([37.701755474164514, 55.72746296684207, 500000]);
        }
        points.forEach((point) => {
            const lngLat = [point[0], point[1]];
            const mapPoint = projectGeoToMap(lngLat);
            point[0] = mapPoint[0];
            point[1] = mapPoint[1];
        });
        points = points.filter(
            (point) =>
                !Number.isNaN(point[0]) && !Number.isNaN(point[1]) && !Number.isNaN(point[2]),
        );
        points = points.filter((point) => {
            return (
                point[0] > bounds[0][0] &&
                point[0] < bounds[1][0] &&
                point[1] > bounds[1][1] &&
                point[1] < bounds[0][1]
            );
        });

        const temps: number[] = [];
        for (let i = 0; i < points.length; i++) {
            temps.push(points[i][2]);
        }
        temps.sort((a, b) => a - b);
        const maxTemp = temps[Math.floor(temps.length * 0.9)];
        const minTemp = temps[0];

        points.forEach((point) => {
            point[2] = Math.min(point[2] - minTemp, maxTemp - minTemp) / (maxTemp - minTemp);
        });

        // const step = 2000;
        const step = 50000;
        const stepX = step;
        const stepY = step;
        const grid = pointsToGrid(points, { stepX, stepY });

        heatmap.setData(grid);
    });
