export interface HeatmapOptions {
    size: number;
    height: number;
    faces: number;
    opacity: number;
    hueOfMinValue: number;
    saturationOfMinValue: number;
    lightOfMinValue: number;
    hueOfMaxValue: number;
    saturationOfMaxValue: number;
    lightOfMaxValue: number;
    lightAngle: number;
    lightInfluence: number;
    gridStepSize: number;
    gridMinPercentile: number;
    gridMaxPercentile: number;
    adaptiveViewportPallete: boolean;
}
export declare class Heatmap {
    private map;
    private options;
    private canvas;
    private gl;
    private ext;
    private matrix;
    private program;
    private points?;
    private grid?;
    private buffer?;
    private vao?;
    private vertexCount;
    private lightDirection;
    private minValue;
    private maxValue;
    private needRerender;
    constructor(map: mapgl.Map, container: HTMLElement, options?: HeatmapOptions);
    setOptions(options: HeatmapOptions): void;
    setData(points: number[][]): void;
    private updateSize;
    private update;
    private findViewportMinMaxTemp;
}
