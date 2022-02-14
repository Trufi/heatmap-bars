import { clamp, lerp } from '@trufi/utils';
export const startAnimation = (anim, value, duration) => {
    anim.from = anim.value;
    anim.to = value;
    anim.startTime = Date.now();
    anim.endTime = anim.startTime + duration;
};
export const updateAnimation = (anim) => {
    const now = Date.now();
    const prevValue = anim.value;
    const t = clamp((now - anim.startTime) / (anim.endTime - anim.startTime), 0, 1);
    anim.value = lerp(anim.from, anim.to, t);
    return prevValue !== anim.value;
};
//# sourceMappingURL=animation.js.map