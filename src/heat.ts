import ShaderProgram from '2gl/ShaderProgram';
import BufferChannel from '2gl/BufferChannel';
import Shader from '2gl/Shader';
import Buffer from '2gl/Buffer';
import Vao from '2gl/Vao';

import * as mat4 from '@2gis/gl-matrix/mat4';
import * as vec2 from '@2gis/gl-matrix/vec2';
import { Grid, pointsToGrid } from './points';
import { degToRad, projectGeoToMap, clamp, lerp } from './utils';

const tempMatrix = new Float32Array(mat4.create());
const compileShader = WebGLRenderingContext.prototype.compileShader;

WebGLRenderingContext.prototype.compileShader = function(shader) {
    compileShader.call(this, shader);

    if (!this.getShaderParameter(shader, this.COMPILE_STATUS)) {
        console.log(this.getShaderInfoLog(shader));
    }
};

const linkProgram = WebGLRenderingContext.prototype.linkProgram;
WebGLRenderingContext.prototype.linkProgram = function(program) {
    linkProgram.call(this, program);

    if (!this.getProgramParameter(program, this.LINK_STATUS)) {
        console.error(this.getProgramInfoLog(program));
    }
};

const vertexShaderSource = `
    attribute vec3 a_position;
    attribute vec2 a_offset;
    attribute vec2 a_normal;
    attribute float a_value;

    uniform vec2 u_value_range;

    uniform mat4 u_model;
    uniform float u_height;
    uniform float u_size;

    uniform vec2 u_hue_range;
    uniform vec3 u_sla;

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
        // points.forEach((point) => {
            //     point[2] = Math.max(Math.min(point[2], maxTemp), minTemp);
            //     point[2] = (point[2] - minTemp) / (maxTemp - minTemp);
            // });

        float value = max(min(a_value, u_value_range.y), u_value_range.x);
        value = (value - u_value_range.x) / (u_value_range.y - u_value_range.x);

        float hue =  mix(u_hue_range.x, u_hue_range.y, value);
        float light_weight = 1.0 + u_light_influence * (abs(dot(u_light_direction, a_normal)) - 1.0);
        if (a_normal.x == 0.0 && a_normal.y == 0.0) {
            light_weight = 1.0;
        }

        vec3 rgb = hslToRgb(hue, u_sla.x, u_sla.y);
        v_color = vec4(rgb * light_weight, u_sla.z);

        gl_Position = u_model * vec4(
            vec2(a_position.xy + a_offset * u_size),
            a_position.z * u_height * value,
            1.0
        );
    }
`;

const fragmentShaderSource = `
    precision mediump float;

    varying vec4 v_color;

    void main(void) {
        gl_FragColor = v_color;
    }
`;

const adaptivePalleteDuration = 300;

export interface HeatOptions {
    size: number;
    height: number;
    faces: number;
    opacity: number;
    hueOfMinValue: number;
    hueOfMaxValue: number;
    saturation: number;
    light: number;
    lightAngle: number;
    lightInfluence: number;
    gridStepSize: number;
    gridMinPercentile: number;
    gridMaxPercentile: number;
    adaptiveViewportPallete: boolean;
}

interface Animation {
    startTime: number;
    endTime: number;
    from: number;
    to: number;
    value: number;
}
const startAnimation = (anim: Animation, value: number, duration: number) => {
    anim.from = anim.value;
    anim.to = value;
    anim.startTime = Date.now();
    anim.endTime = anim.startTime + duration;
};
const updateAnimation = (anim: Animation) => {
    const now = Date.now();
    const prevValue = anim.value;
    const t = clamp((now - anim.startTime) / (anim.endTime - anim.startTime), 0, 1);
    anim.value = lerp(anim.from, anim.to, t);
    return prevValue !== anim.value;
};

export class Heat {
    private options: HeatOptions = {
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
        adaptiveViewportPallete: false,
    };
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private ext: { OES_vertex_array_object: OES_vertex_array_object };
    private matrix: TypedArray;
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

    constructor(private map: any, container: HTMLElement, options?: HeatOptions) {
        if (options) {
            this.setOptions(options);
        }

        this.lightDirection = [
            -Math.sin(degToRad(this.options.lightAngle)),
            -Math.cos(degToRad(this.options.lightAngle)),
        ];
        this.minValue = { startTime: 0, endTime: 0, value: 0, from: 0, to: 0 };
        this.maxValue = { startTime: 0, endTime: 0, value: 0, from: 0, to: 0 };

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

        this.matrix = mat4.create();
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
                { name: 'u_sla', type: '3f' },
                { name: 'u_light_direction', type: '2f' },
                { name: 'u_light_influence', type: '1f' },
                { name: 'u_value_range', type: '2f' },
            ],
        });

        requestAnimationFrame(this.update);

        this.map.on('moveend', () => {
            if (this.options.adaptiveViewportPallete) {
                (window as any).requestIdleCallback(() => {
                    this.findViewportMinMaxTemp();
                });
            }
        });

        this.map.on('move', () => {
            this.needRerender = true;
        });
    }

    public setOptions(options: HeatOptions) {
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

        mat4.fromTranslationScale(
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

                    vec2.add(wallNormal, offsetLeft, offsetRight);
                    vec2.normalize(wallNormal, wallNormal);

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
        this.canvas.width = size[0];
        this.canvas.height = size[1];
        this.canvas.style.width = size[0] * window.devicePixelRatio + 'px';
        this.canvas.style.height = size[1] * window.devicePixelRatio + 'px';

        this.gl.viewport(0, 0, size[0], size[1]);

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
        mat4.mul(tempMatrix, mapMatrix, this.matrix);

        this.program.enable(gl);

        this.program.bind(gl, {
            u_size: this.options.size,
            u_height: this.options.height,
            u_model: tempMatrix,
            u_hue_range: [this.options.hueOfMinValue, this.options.hueOfMaxValue],
            u_sla: [this.options.saturation, this.options.light, this.options.opacity],
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
            const northEast = projectGeoToMap(bounds.northEast);
            const southWest = projectGeoToMap(bounds.southWest);

            vec2.min(min, northEast, southWest);

            vec2.max(max, northEast, southWest);

            vec2.sub(min, min, [grid.minX, grid.minY]);
            vec2.sub(max, max, [grid.minX, grid.minY]);

            const scaler = [1 / grid.stepX, 1 / grid.stepY];
            vec2.mul(min, min, scaler);
            vec2.mul(max, max, scaler);

            vec2.floor(min, min);
            vec2.max(min, min, [0, 0]);

            vec2.floor(max, max);
            vec2.min(max, max, [grid.width, grid.height]);
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
        const mapPoint = projectGeoToMap(lngLat);
        return [mapPoint[0], mapPoint[1], point[2]];
    });

    return pointsToGrid(points, { stepX: gridStepSize, stepY: gridStepSize });
}
