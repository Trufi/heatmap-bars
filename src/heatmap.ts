/// <reference types="@2gis/mapgl/global" />

import Buffer from '2gl/Buffer';
import BufferChannel from '2gl/BufferChannel';
import Shader from '2gl/Shader';
import ShaderProgram from '2gl/ShaderProgram';
import Vao from '2gl/Vao';
import {
    degToRad,
    mapPointFromLngLat,
    mat4create,
    mat4fromTranslationScale,
    mat4mul,
    vec2add,
    vec2floor,
    vec2max,
    vec2min,
    vec2mul,
    vec2normalize,
    vec2sub,
} from '@trufi/utils';
import { Animation, startAnimation, updateAnimation } from './animation';
import { Grid, pointsToGrid } from './points';
import { fragmentShaderSource, vertexShaderSource } from './shaders';

const tempMatrix = new Float32Array(mat4create());

const adaptivePalleteDuration = 300;

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

export class Heatmap {
    private options: HeatmapOptions = {
        size: 1.4,
        height: 500000,
        faces: 4,
        opacity: 0.9,
        hueOfMinValue: 240,
        saturationOfMinValue: 0.5,
        lightOfMinValue: 0.5,
        hueOfMaxValue: 0,
        saturationOfMaxValue: 0.5,
        lightOfMaxValue: 0.5,
        lightAngle: 30,
        lightInfluence: 0.5,
        gridStepSize: 50000,
        gridMinPercentile: 0.01,
        gridMaxPercentile: 0.95,
        adaptiveViewportPallete: false,
    };
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private ext: { OES_vertex_array_object: OES_vertex_array_object };
    private matrix = mat4create();
    private program: ShaderProgram;
    private points?: number[][];
    private grid?: Grid;
    private buffer?: Buffer;
    private vao?: Vao;
    private vertexCount: number;
    private lightDirection: number[];
    private minValue: Animation;
    private maxValue: Animation;
    private needRerender: boolean;

    constructor(private map: mapgl.Map, container: HTMLElement, options?: HeatmapOptions) {
        if (options) {
            this.setOptions(options);
        }

        this.lightDirection = [
            -Math.sin(degToRad(this.options.lightAngle)),
            -Math.cos(degToRad(this.options.lightAngle)),
        ];
        this.minValue = { startTime: 0, endTime: 0, value: 0, from: 0, to: 0 };
        this.maxValue = { startTime: 0, endTime: 0, value: 0, from: 0, to: 0 };
        this.needRerender = false;

        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.left = '0';
        this.canvas.style.top = '0';
        this.canvas.style.pointerEvents = 'none';
        container.appendChild(this.canvas);

        const gl = (this.gl = this.canvas.getContext('webgl', {
            antialias: true,
            premultipliedAlpha: false,
            alpha: true,
        }) as WebGLRenderingContext);

        this.ext = {
            OES_vertex_array_object: gl.getExtension(
                'OES_vertex_array_object',
            ) as OES_vertex_array_object,
        };

        this.updateSize();
        window.addEventListener('resize', this.updateSize);

        gl.clearColor(1, 1, 1, 0);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ZERO);

        this.vertexCount = 0;
        this.program = new ShaderProgram({
            vertex: new Shader('vertex', vertexShaderSource),
            fragment: new Shader('fragment', fragmentShaderSource),
            attributes: [
                { name: 'a_position' },
                { name: 'a_offset' },
                { name: 'a_normal' },
                { name: 'a_value' },
            ],
            uniforms: [
                { name: 'u_model', type: 'mat4' },
                { name: 'u_height', type: '1f' },
                { name: 'u_size', type: '1f' },
                { name: 'u_hue_range', type: '2f' },
                { name: 'u_saturation_range', type: '2f' },
                { name: 'u_light_range', type: '2f' },
                { name: 'u_alpha', type: '1f' },
                { name: 'u_light_direction', type: '2f' },
                { name: 'u_light_influence', type: '1f' },
                { name: 'u_value_range', type: '2f' },
            ],
        });

        requestAnimationFrame(this.update);

        this.map.on('moveend', () => {
            if (this.options.adaptiveViewportPallete) {
                window.requestIdleCallback(() => {
                    this.findViewportMinMaxTemp();
                });
            }
        });

        this.map.on('move', () => {
            this.needRerender = true;
        });
    }

    public setOptions(options: HeatmapOptions) {
        const needNewBuffer =
            options.faces !== this.options.faces ||
            options.gridStepSize !== this.options.gridStepSize;

        const needNewMinMax =
            options.adaptiveViewportPallete !== this.options.adaptiveViewportPallete ||
            options.gridMinPercentile !== this.options.gridMinPercentile ||
            options.gridMaxPercentile !== this.options.gridMaxPercentile;

        this.options = { ...this.options, ...options };

        this.lightDirection = [
            -Math.sin(degToRad(this.options.lightAngle)),
            -Math.cos(degToRad(this.options.lightAngle)),
        ];

        if (needNewBuffer && this.points) {
            this.setData(this.points);
        } else if (needNewMinMax) {
            this.findViewportMinMaxTemp();
        }

        this.needRerender = true;
    }

    public setData(points: number[][]) {
        this.points = points;

        if (this.vao) {
            this.vao.remove();
        }
        if (this.buffer) {
            this.buffer.remove();
        }

        const grid = (this.grid = createGrid(points, this.options.gridStepSize));
        this.findViewportMinMaxTemp();

        mat4fromTranslationScale(
            this.matrix,
            [grid.minX, grid.minY, 0],
            [grid.stepX, grid.stepY, 1],
        );

        const array: number[] = [];
        let i = 0;

        const vertex = (
            x: number,
            y: number,
            z: number,
            offset: number[],
            normal: number[],
            value: number,
        ) => {
            // position
            array[i++] = x;
            array[i++] = y;
            array[i++] = z;

            // offset
            array[i++] = offset[0];
            array[i++] = offset[1];

            // normal
            array[i++] = normal[0];
            array[i++] = normal[1];

            array[i++] = value;
        };

        const wallNormal: number[] = [];
        const zeroOffset = [0, 0];
        const roofNormal = [0, 0];
        const offsets: number[][] = [];
        const angle = (Math.PI * 2) / this.options.faces;
        const startAngle = -angle / 2;
        const r = 0.5;
        for (let i = 0; i < this.options.faces; i++) {
            const alpha = startAngle + angle * i;
            offsets.push([r * Math.sin(alpha), r * Math.cos(alpha)]);
        }
        offsets.push(offsets[0]);

        for (let x = 0; x < grid.width; x++) {
            for (let y = 0; y < grid.height; y++) {
                const value = grid.array[x + y * grid.width];

                if (Number.isNaN(value)) {
                    continue;
                }

                for (let i = 1; i < offsets.length; i++) {
                    const offsetLeft = offsets[i - 1];
                    const offsetRight = offsets[i];

                    vec2add(wallNormal, offsetLeft, offsetRight);
                    vec2normalize(wallNormal, wallNormal);

                    // roof
                    vertex(x, y, 1, zeroOffset, roofNormal, value);
                    vertex(x, y, 1, offsetRight, roofNormal, value);
                    vertex(x, y, 1, offsetLeft, roofNormal, value);

                    // wall
                    vertex(x, y, 0, offsetLeft, wallNormal, value);
                    vertex(x, y, 1, offsetLeft, wallNormal, value);
                    vertex(x, y, 1, offsetRight, wallNormal, value);

                    vertex(x, y, 1, offsetRight, wallNormal, value);
                    vertex(x, y, 0, offsetRight, wallNormal, value);
                    vertex(x, y, 0, offsetLeft, wallNormal, value);
                }
            }
        }

        this.vertexCount = array.length / 8;

        const stride = 8 * 4;
        let offset = 0;

        this.buffer = new Buffer(new Float32Array(array));

        const positionBuffer = new BufferChannel(this.buffer, {
            itemSize: 3,
            dataType: Buffer.Float,
            stride,
            offset,
        });
        offset += 3 * 4;

        const offsetBuffer = new BufferChannel(this.buffer, {
            itemSize: 2,
            dataType: Buffer.Float,
            stride,
            offset,
        });
        offset += 2 * 4;

        const normalBuffer = new BufferChannel(this.buffer, {
            itemSize: 2,
            dataType: Buffer.Float,
            stride,
            offset,
        });
        offset += 2 * 4;

        const valueBuffer = new BufferChannel(this.buffer, {
            itemSize: 1,
            dataType: Buffer.Float,
            stride,
            offset,
        });
        offset += 1 * 4;

        this.vao = new Vao(this.program, {
            a_position: positionBuffer,
            a_offset: offsetBuffer,
            a_normal: normalBuffer,
            a_value: valueBuffer,
        });

        this.needRerender = true;
    }

    private updateSize = () => {
        const size = this.map.getSize();

        this.canvas.width = size[0] * window.devicePixelRatio;
        this.canvas.height = size[1] * window.devicePixelRatio;
        this.canvas.style.width = size[0] + 'px';
        this.canvas.style.height = size[1] + 'px';

        this.gl.viewport(
            0,
            0,
            size[0] * window.devicePixelRatio,
            size[1] * window.devicePixelRatio,
        );

        this.needRerender = true;
    };

    private update = () => {
        requestAnimationFrame(this.update);

        if (!this.vao) {
            return;
        }

        const changeMinValue = updateAnimation(this.minValue);
        const changeMaxValue = updateAnimation(this.maxValue);

        if (!this.needRerender && !changeMinValue && !changeMaxValue) {
            return;
        }

        const gl = this.gl;

        const mapMatrix = this.map.getProjectionMatrix();
        mat4mul(tempMatrix as any as number[], mapMatrix, this.matrix);

        this.program.enable(gl);

        this.program.bind(gl, {
            u_size: this.options.size,
            u_height: this.options.height,
            u_model: tempMatrix,
            u_hue_range: [this.options.hueOfMinValue, this.options.hueOfMaxValue],
            u_saturation_range: [
                this.options.saturationOfMinValue,
                this.options.saturationOfMaxValue,
            ],
            u_light_range: [this.options.lightOfMinValue, this.options.lightOfMaxValue],
            u_alpha: this.options.opacity,
            u_light_direction: this.lightDirection,
            u_light_influence: this.options.lightInfluence,
            u_value_range: [this.minValue.value, this.maxValue.value],
        });

        this.vao.bind({
            gl,
            extensions: this.ext,
        });

        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    };

    private findViewportMinMaxTemp() {
        if (!this.grid) {
            return;
        }
        const grid = this.grid;
        const min = [0, 0];
        const max = [grid.width, grid.height];

        if (this.options.adaptiveViewportPallete) {
            const bounds = this.map.getBounds();
            const northEast = mapPointFromLngLat(bounds.northEast);
            const southWest = mapPointFromLngLat(bounds.southWest);

            vec2min(min, northEast, southWest);
            vec2max(max, northEast, southWest);

            vec2sub(min, min, [grid.minX, grid.minY]);
            vec2sub(max, max, [grid.minX, grid.minY]);

            const scaler = [1 / grid.stepX, 1 / grid.stepY];
            vec2mul(min, min, scaler);
            vec2mul(max, max, scaler);

            vec2floor(min, min);
            vec2max(min, min, [0, 0]);

            vec2floor(max, max);
            vec2min(max, max, [grid.width, grid.height]);
        }

        const temps: number[] = [];
        for (let x = min[0]; x < max[0]; x++) {
            for (let y = min[1]; y < max[1]; y++) {
                const value = grid.array[x + y * grid.width];
                if (!Number.isNaN(value)) {
                    temps.push(value);
                }
            }
        }

        temps.sort((a, b) => a - b);

        startAnimation(
            this.minValue,
            temps[Math.floor(temps.length * this.options.gridMinPercentile)],
            adaptivePalleteDuration,
        );
        startAnimation(
            this.maxValue,
            temps[
                Math.min(
                    Math.floor(temps.length * this.options.gridMaxPercentile),
                    temps.length - 1,
                )
            ],
            adaptivePalleteDuration,
        );
    }
}

function createGrid(geoPoints: number[][], gridStepSize: number): Grid {
    const points = geoPoints.map((point) => {
        const lngLat = [point[0], point[1]];
        const mapPoint = mapPointFromLngLat(lngLat);
        return [mapPoint[0], mapPoint[1], point[2]];
    });

    return pointsToGrid(points, { stepX: gridStepSize, stepY: gridStepSize });
}
