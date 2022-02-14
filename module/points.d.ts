export interface GridOptions {
    minX?: number;
    maxX?: number;
    stepX: number;
    minY?: number;
    maxY?: number;
    stepY: number;
}
export declare function pointsToGrid(points: number[][], options: GridOptions): {
    width: number;
    height: number;
    array: any[];
    minX: number;
    minY: number;
    stepX: number;
    stepY: number;
};
export declare type Grid = ReturnType<typeof pointsToGrid>;
