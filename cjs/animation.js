"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAnimation = exports.startAnimation = void 0;
const utils_1 = require("@trufi/utils");
const startAnimation = (anim, value, duration) => {
    anim.from = anim.value;
    anim.to = value;
    anim.startTime = Date.now();
    anim.endTime = anim.startTime + duration;
};
exports.startAnimation = startAnimation;
const updateAnimation = (anim) => {
    const now = Date.now();
    const prevValue = anim.value;
    const t = (0, utils_1.clamp)((now - anim.startTime) / (anim.endTime - anim.startTime), 0, 1);
    anim.value = (0, utils_1.lerp)(anim.from, anim.to, t);
    return prevValue !== anim.value;
};
exports.updateAnimation = updateAnimation;
//# sourceMappingURL=animation.js.map