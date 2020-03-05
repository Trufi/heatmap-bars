import * as dat from 'dat.gui';
import { pointsToGrid } from './points';
import { projectGeoToMap } from './utils';
import { Heat, HeatOptions } from './heat';

declare const mapgl: any;

const container = document.getElementById('map') as HTMLElement;

const map = ((window as any).map = new mapgl.Map(container, {
    center: [37.62017, 55.753466],
    zoom: 11,
    key: '042b5b75-f847-4f2a-b695-b5f58adc9dfd',
    zoomControl: false,
}));

const heatmap = new Heat(map, container);

const gui = new dat.GUI();
const heatOptions: HeatOptions = {
    size: 1,
    height: 500000,
    faces: 4,
};
gui.add(heatOptions, 'size', 0, 2).onChange(() => heatmap.setOptions(heatOptions));
gui.add(heatOptions, 'height', 0, 1000000).onChange(() => heatmap.setOptions(heatOptions));
gui.add(heatOptions, 'faces', 2, 20).onChange(() => heatmap.setOptions(heatOptions));

const bounds = [
    projectGeoToMap([37.53468263266983, 55.8057898485786]),
    projectGeoToMap([37.73449647407034, 55.680559093862406]),
];

fetch('./data.csv')
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
        console.log(grid);

        let temp = grid.array.slice();
        temp.sort((a, b) => a - b);
        temp = temp.slice(temp.findIndex((x) => x > 0));
        const range = new Array(5).fill(0).map((_, i) => temp[Math.ceil((i * temp.length) / 5)]);

        console.log(range);

        // const hexColors = ['00ff08', 'b4ff00', 'e4ff00', 'ff8d00', 'ff0000'].map((c) => '#99' + c);

        heatmap.setData(grid);

        // grid.array.forEach((z, index) => {
        //     // index = x + y * width
        //     const x = index % grid.width;
        //     const y = Math.floor(index / grid.width);

        //     const topLeft = projectMapToGeo([x * stepX + grid.minX, y * stepY + grid.minY]);
        //     const bottomRight = projectMapToGeo([
        //         (x + 1) * stepX + grid.minX,
        //         (y + 1) * stepY + grid.minY,
        //     ]);
        //     const bottomLeft = [topLeft[0], bottomRight[1]];
        //     const topRight = [bottomRight[0], topLeft[1]];

        //     let i = range.findIndex((range) => z < range);
        //     if (i === -1) {
        //         i = 5;
        //     }
        //     i--;
        //     if (i === -1) {
        //         return;
        //     }

        //     // tslint:disable-next-line
        //     new Polygon(map._impl, {
        //         coordinates: [[topLeft, bottomLeft, bottomRight, topRight]],
        //         color: hexColors[i % hexColors.length],
        //         borderWidth: 0,
        //     });
        // });
    });
