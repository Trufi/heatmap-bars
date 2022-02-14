import { clamp, lerp } from '@trufi/utils';

export interface Animation {
    startTime: number;
    endTime: number;
    from: number;
    to: number;
    value: number;
}

export const startAnimation = (anim: Animation, value: number, duration: number) => {
    anim.from = anim.value;
    anim.to = value;
    anim.startTime = Date.now();
    anim.endTime = anim.startTime + duration;
};

export const updateAnimation = (anim: Animation) => {
    const now = Date.now();
    const prevValue = anim.value;
    const t = clamp((now - anim.startTime) / (anim.endTime - anim.startTime), 0, 1);
    anim.value = lerp(anim.from, anim.to, t);
    return prevValue !== anim.value;
};
