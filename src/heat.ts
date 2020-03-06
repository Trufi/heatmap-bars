import ShaderProgram from '2gl/ShaderProgram';
import BufferChannel from '2gl/BufferChannel';
import Shader from '2gl/Shader';
import Buffer from '2gl/Buffer';
import Vao from '2gl/Vao';

import * as mat4 from '@2gis/gl-matrix/mat4';
import * as vec2 from '@2gis/gl-matrix/vec2';
import { Grid, pointsToGrid } from './points';
import { degToRad, projectGeoToMap } from './utils';

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
        float hue =  mix(u_hue_range.x, u_hue_range.y, a_value);
        float light_weight = 1.0 + u_light_influence * (abs(dot(u_light_direction, a_normal)) - 1.0);
        if (a_normal.x == 0.0 && a_normal.y == 0.0) {
            light_weight = 1.0;
        }

        vec3 rgb = hslToRgb(hue, u_sla.x, u_sla.y);
        v_color = vec4(rgb * light_weight, u_sla.z);

        gl_Position = u_model * vec4(
            vec2(a_position.xy + a_offset * u_size),
            a_position.z * u_height * a_value,
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
}

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
    };
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private ext: { OES_vertex_array_object: OES_vertex_array_object };
    private matrix: TypedArray;
    private program: ShaderProgram;
    private points?: number[][];
    private buffer?: Buffer;
    private vao?: Vao;
    private vertexCount: number;
    private lightDirection: number[];

    constructor(private map: any, container: HTMLElement, options?: HeatOptions) {
        if (options) {
            this.setOptions(options);
        }

        this.lightDirection = [
            -Math.sin(degToRad(this.options.lightAngle)),
            -Math.cos(degToRad(this.options.lightAngle)),
        ];

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
            ],
        });

        requestAnimationFrame(this.update);
    }

    public setOptions(options: HeatOptions) {
        const needNewBuffer =
            options.faces !== this.options.faces ||
            options.gridMinPercentile !== this.options.gridMinPercentile ||
            options.gridMaxPercentile !== this.options.gridMaxPercentile ||
            options.gridStepSize !== this.options.gridStepSize;

        this.options = { ...this.options, ...options };

        this.lightDirection = [
            -Math.sin(degToRad(this.options.lightAngle)),
            -Math.cos(degToRad(this.options.lightAngle)),
        ];

        if (needNewBuffer && this.points) {
            this.setData(this.points);
        }
    }

    public setData(points: number[][]) {
        this.points = points;

        if (this.vao) {
            this.vao.remove();
        }
        if (this.buffer) {
            this.buffer.remove();
        }

        const grid = createGrid(
            points,
            this.options.gridStepSize,
            this.options.gridMinPercentile,
            this.options.gridMaxPercentile,
        );

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
    }

    private updateSize = () => {
        const size = this.map.getSize();
        this.canvas.width = size[0];
        this.canvas.height = size[1];
        this.canvas.style.width = size[0] * window.devicePixelRatio + 'px';
        this.canvas.style.height = size[1] * window.devicePixelRatio + 'px';

        this.gl.viewport(0, 0, size[0], size[1]);
    };

    private update = () => {
        requestAnimationFrame(this.update);

        if (!this.vao) {
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
        });

        this.vao.bind({
            gl,
            extensions: this.ext,
        });

        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    };
}

function createGrid(
    geoPoints: number[][],
    gridStepSize: number,
    minPercentile: number,
    maxPercentile: number,
): Grid {
    const points = geoPoints.map((point) => {
        const lngLat = [point[0], point[1]];
        const mapPoint = projectGeoToMap(lngLat);
        return [mapPoint[0], mapPoint[1], point[2]];
    });

    const temps: number[] = [];
    for (let i = 0; i < points.length; i++) {
        temps.push(points[i][2]);
    }
    temps.sort((a, b) => a - b);
    const minTemp = temps[Math.floor(temps.length * minPercentile)];
    const maxTemp = temps[Math.min(Math.floor(temps.length * maxPercentile), temps.length - 1)];

    points.forEach((point) => {
        point[2] = Math.max(Math.min(point[2], maxTemp), minTemp);
        point[2] = (point[2] - minTemp) / (maxTemp - minTemp);
    });

    return pointsToGrid(points, { stepX: gridStepSize, stepY: gridStepSize });
}
