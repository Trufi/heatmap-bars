import ShaderProgram from '2gl/ShaderProgram';
import BufferChannel from '2gl/BufferChannel';
import Shader from '2gl/Shader';
import Buffer from '2gl/Buffer';
import Vao from '2gl/Vao';

import * as mat4 from '@2gis/gl-matrix/mat4';
import { Grid } from './points';
// import * as vec3 from '@2gis/gl-matrix/vec3';

const tempMatrix = new Float32Array(mat4.create());

const vertexShaderSource = `
    attribute vec3 a_position;
    attribute vec2 a_offset;
    attribute float a_value;

    uniform mat4 u_model;
    uniform float u_height;
    uniform float u_size;

    varying float v_value;

    void main(void) {
        v_value = a_value;

        gl_Position = u_model * vec4(
            vec2(a_position.xy + a_offset * u_size),
            a_position.z * u_height * a_value,
            1.0
        );
    }
`;

const fragmentShaderSource = `
    precision mediump float;

    varying float v_value;

    void main(void) {
        gl_FragColor = vec4(v_value, 0.0, 0.0, 1.0);
    }
`;

export interface HeatOptions {
    size: number;
    height: number;
    faces: number;
}

export class Heat {
    private options: HeatOptions = {
        size: 1,
        height: 500000,
        faces: 4,
    };
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private ext: { OES_vertex_array_object: OES_vertex_array_object };
    private matrix: TypedArray;
    private program: ShaderProgram;
    private buffer?: Buffer;
    private vao?: Vao;
    private vertexCount: number;

    constructor(private map: any, container: HTMLElement, options?: HeatOptions) {
        if (options) {
            this.setOptions(options);
        }

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
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this.matrix = mat4.create();
        this.vertexCount = 0;
        this.program = new ShaderProgram({
            vertex: new Shader('vertex', vertexShaderSource),
            fragment: new Shader('fragment', fragmentShaderSource),
            attributes: [{ name: 'a_position' }, { name: 'a_offset' }, { name: 'a_value' }],
            uniforms: [
                { name: 'u_model', type: 'mat4' },
                { name: 'u_height', type: '1f' },
                { name: 'u_size', type: '1f' },
            ],
        });

        requestAnimationFrame(this.update);
    }

    public setOptions(options: HeatOptions) {
        this.options = { ...this.options, ...options };
    }

    public setData(grid: Grid) {
        mat4.fromTranslationScale(
            this.matrix,
            [grid.minX, grid.minY, 0],
            [grid.stepX, grid.stepY, 1],
        );

        const verticesPerCell = this.options.faces * 9;
        this.vertexCount = grid.width * grid.height * verticesPerCell;

        const array = new Float32Array(this.vertexCount * 6);
        let i = 0;

        const vertex = (x: number, y: number, z: number, offset: number[], value: number) => {
            // position
            array[i++] = x;
            array[i++] = y;
            array[i++] = z;

            // offset
            array[i++] = offset[0];
            array[i++] = offset[1];

            array[i++] = value;
        };

        const zeroOffset = [0, 0];
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

                for (let i = 1; i < offsets.length; i++) {
                    const offsetLeft = offsets[i - 1];
                    const offsetRight = offsets[i];

                    // roof
                    vertex(x, y, 1, zeroOffset, value);
                    vertex(x, y, 1, offsetRight, value);
                    vertex(x, y, 1, offsetLeft, value);

                    // wall
                    vertex(x, y, 0, offsetLeft, value);
                    vertex(x, y, 1, offsetLeft, value);
                    vertex(x, y, 1, offsetRight, value);

                    vertex(x, y, 1, offsetRight, value);
                    vertex(x, y, 0, offsetRight, value);
                    vertex(x, y, 0, offsetLeft, value);
                }
            }
        }

        const stride = 6 * 4;
        let offset = 0;

        this.buffer = new Buffer(array);

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
        });

        this.vao.bind({
            gl,
            extensions: this.ext,
        });

        gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    };
}
