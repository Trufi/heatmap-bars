export interface GridOptions {
    minX?: number;
    maxX?: number;
    stepX: number;

    minY?: number;
    maxY?: number;
    stepY: number;
}

export function pointsToGrid(points: number[][], options: GridOptions) {
    const { stepX, stepY } = options;
    let minX: number, maxX: number, minY: number, maxY: number;

    if (!options.minX || !options.maxX || !options.minY || !options.maxY) {
        ({ minX, maxX, minY, maxY } = findBounds(points));
    } else {
        ({ minX, maxX, minY, maxY } = options);
    }

    const width = Math.ceil((maxX - minX) / stepX);
    const height = Math.ceil((maxY - minY) / stepY);

    const array = new Array(width * height).fill(0);
    const count = new Array(width * height).fill(0);

    points.forEach(([x, y, z]) => {
        const cellX = Math.floor((x - minX) / stepX);
        const cellY = Math.floor((y - minY) / stepY);
        array[cellX + cellY * width] += z;
        count[cellX + cellY * width] += 1;
    });

    for (let i = 0; i < width * height; i++) {
        if (count[i] !== 0) {
            array[i] /= count[i];
        }
    }

    return { width, height, array, minX, minY, stepX, stepY };
}

export type Grid = ReturnType<typeof pointsToGrid>;

function findBounds(points: number[][]) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    points.forEach(([x, y]) => {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    });

    return { minX, maxX, minY, maxY };
}
