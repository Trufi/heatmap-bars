"use strict";
/// <reference types="@2gis/mapgl/global" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.Heatmap = void 0;
const Buffer_1 = require("2gl/Buffer");
const BufferChannel_1 = require("2gl/BufferChannel");
const Shader_1 = require("2gl/Shader");
const ShaderProgram_1 = require("2gl/ShaderProgram");
const Vao_1 = require("2gl/Vao");
const utils_1 = require("@trufi/utils");
const animation_1 = require("./animation");
const points_1 = require("./points");
const shaders_1 = require("./shaders");
const tempMatrix = new Float32Array((0, utils_1.mat4create)());
const adaptivePalleteDuration = 300;
class Heatmap {
    constructor(map, container, options) {
        this.map = map;
        this.options = {
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
        this.matrix = (0, utils_1.mat4create)();
        this.updateSize = () => {
            const size = this.map.getSize();
            this.canvas.width = size[0] * window.devicePixelRatio;
            this.canvas.height = size[1] * window.devicePixelRatio;
            this.canvas.style.width = size[0] + 'px';
            this.canvas.style.height = size[1] + 'px';
            this.gl.viewport(0, 0, size[0] * window.devicePixelRatio, size[1] * window.devicePixelRatio);
            this.needRerender = true;
        };
        this.update = () => {
            requestAnimationFrame(this.update);
            if (!this.vao) {
                return;
            }
            const changeMinValue = (0, animation_1.updateAnimation)(this.minValue);
            const changeMaxValue = (0, animation_1.updateAnimation)(this.maxValue);
            if (!this.needRerender && !changeMinValue && !changeMaxValue) {
                return;
            }
            const gl = this.gl;
            const mapMatrix = this.map.getProjectionMatrix();
            (0, utils_1.mat4mul)(tempMatrix, mapMatrix, this.matrix);
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
        if (options) {
            this.setOptions(options);
        }
        this.lightDirection = [
            -Math.sin((0, utils_1.degToRad)(this.options.lightAngle)),
            -Math.cos((0, utils_1.degToRad)(this.options.lightAngle)),
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
        }));
        this.ext = {
            OES_vertex_array_object: gl.getExtension('OES_vertex_array_object'),
        };
        this.updateSize();
        window.addEventListener('resize', this.updateSize);
        gl.clearColor(1, 1, 1, 0);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ZERO);
        this.vertexCount = 0;
        this.program = new ShaderProgram_1.default({
            vertex: new Shader_1.default('vertex', shaders_1.vertexShaderSource),
            fragment: new Shader_1.default('fragment', shaders_1.fragmentShaderSource),
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
    setOptions(options) {
        const needNewBuffer = options.faces !== this.options.faces ||
            options.gridStepSize !== this.options.gridStepSize;
        const needNewMinMax = options.adaptiveViewportPallete !== this.options.adaptiveViewportPallete ||
            options.gridMinPercentile !== this.options.gridMinPercentile ||
            options.gridMaxPercentile !== this.options.gridMaxPercentile;
        this.options = Object.assign(Object.assign({}, this.options), options);
        this.lightDirection = [
            -Math.sin((0, utils_1.degToRad)(this.options.lightAngle)),
            -Math.cos((0, utils_1.degToRad)(this.options.lightAngle)),
        ];
        if (needNewBuffer && this.points) {
            this.setData(this.points);
        }
        else if (needNewMinMax) {
            this.findViewportMinMaxTemp();
        }
        this.needRerender = true;
    }
    setData(points) {
        this.points = points;
        if (this.vao) {
            this.vao.remove();
        }
        if (this.buffer) {
            this.buffer.remove();
        }
        const grid = (this.grid = createGrid(points, this.options.gridStepSize));
        this.findViewportMinMaxTemp();
        (0, utils_1.mat4fromTranslationScale)(this.matrix, [grid.minX, grid.minY, 0], [grid.stepX, grid.stepY, 1]);
        const array = [];
        let i = 0;
        const vertex = (x, y, z, offset, normal, value) => {
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
        const wallNormal = [];
        const zeroOffset = [0, 0];
        const roofNormal = [0, 0];
        const offsets = [];
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
                    (0, utils_1.vec2add)(wallNormal, offsetLeft, offsetRight);
                    (0, utils_1.vec2normalize)(wallNormal, wallNormal);
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
        this.buffer = new Buffer_1.default(new Float32Array(array));
        const positionBuffer = new BufferChannel_1.default(this.buffer, {
            itemSize: 3,
            dataType: Buffer_1.default.Float,
            stride,
            offset,
        });
        offset += 3 * 4;
        const offsetBuffer = new BufferChannel_1.default(this.buffer, {
            itemSize: 2,
            dataType: Buffer_1.default.Float,
            stride,
            offset,
        });
        offset += 2 * 4;
        const normalBuffer = new BufferChannel_1.default(this.buffer, {
            itemSize: 2,
            dataType: Buffer_1.default.Float,
            stride,
            offset,
        });
        offset += 2 * 4;
        const valueBuffer = new BufferChannel_1.default(this.buffer, {
            itemSize: 1,
            dataType: Buffer_1.default.Float,
            stride,
            offset,
        });
        offset += 1 * 4;
        this.vao = new Vao_1.default(this.program, {
            a_position: positionBuffer,
            a_offset: offsetBuffer,
            a_normal: normalBuffer,
            a_value: valueBuffer,
        });
        this.needRerender = true;
    }
    findViewportMinMaxTemp() {
        if (!this.grid) {
            return;
        }
        const grid = this.grid;
        const min = [0, 0];
        const max = [grid.width, grid.height];
        if (this.options.adaptiveViewportPallete) {
            const bounds = this.map.getBounds();
            const northEast = (0, utils_1.mapPointFromLngLat)(bounds.northEast);
            const southWest = (0, utils_1.mapPointFromLngLat)(bounds.southWest);
            (0, utils_1.vec2min)(min, northEast, southWest);
            (0, utils_1.vec2max)(max, northEast, southWest);
            (0, utils_1.vec2sub)(min, min, [grid.minX, grid.minY]);
            (0, utils_1.vec2sub)(max, max, [grid.minX, grid.minY]);
            const scaler = [1 / grid.stepX, 1 / grid.stepY];
            (0, utils_1.vec2mul)(min, min, scaler);
            (0, utils_1.vec2mul)(max, max, scaler);
            (0, utils_1.vec2floor)(min, min);
            (0, utils_1.vec2max)(min, min, [0, 0]);
            (0, utils_1.vec2floor)(max, max);
            (0, utils_1.vec2min)(max, max, [grid.width, grid.height]);
        }
        const temps = [];
        for (let x = min[0]; x < max[0]; x++) {
            for (let y = min[1]; y < max[1]; y++) {
                const value = grid.array[x + y * grid.width];
                if (!Number.isNaN(value)) {
                    temps.push(value);
                }
            }
        }
        temps.sort((a, b) => a - b);
        (0, animation_1.startAnimation)(this.minValue, temps[Math.floor(temps.length * this.options.gridMinPercentile)], adaptivePalleteDuration);
        (0, animation_1.startAnimation)(this.maxValue, temps[Math.min(Math.floor(temps.length * this.options.gridMaxPercentile), temps.length - 1)], adaptivePalleteDuration);
    }
}
exports.Heatmap = Heatmap;
function createGrid(geoPoints, gridStepSize) {
    const points = geoPoints.map((point) => {
        const lngLat = [point[0], point[1]];
        const mapPoint = (0, utils_1.mapPointFromLngLat)(lngLat);
        return [mapPoint[0], mapPoint[1], point[2]];
    });
    return (0, points_1.pointsToGrid)(points, { stepX: gridStepSize, stepY: gridStepSize });
}
//# sourceMappingURL=heatmap.js.map