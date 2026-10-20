import type { ComponentPropsWithoutRef } from "react";

/** Type declarations for the vendored React Bits Beams component (props copied from the official source's destructuring defaults). */
export interface BeamsProps extends Omit<ComponentPropsWithoutRef<"div">, "color"> {
  color?: string;
  beamWidth?: number;
  rotation?: number;
  speed?: number;
  waveLength?: number;
  depth?: number;
  sharpness?: number;
  twist?: number;
  fillLight?: number;
  glow?: number;
  brightness?: number;
  variation?: number;
  grain?: number;
  quality?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  intro?: boolean;
  fade?: number;
  opacity?: number;
  lightMode?: boolean;
  backgroundColor?: string;
  paused?: boolean;
  dpr?: number;
}
export declare const Beams: (props: BeamsProps) => JSX.Element;
export default Beams;
