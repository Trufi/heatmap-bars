export interface Animation {
    startTime: number;
    endTime: number;
    from: number;
    to: number;
    value: number;
}
export declare const startAnimation: (anim: Animation, value: number, duration: number) => void;
export declare const updateAnimation: (anim: Animation) => boolean;
