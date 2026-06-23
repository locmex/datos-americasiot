import logoImg from "../../imports/image-removebg-preview.png";

interface LogoProps {
  height?: number;
  className?: string;
  /** Kept for backwards compatibility — no longer changes rendering */
  forceDark?: boolean;
  forceLight?: boolean;
}

/**
 * Americas IoT logo — PNG with transparent background.
 * Works on any surface colour without CSS tricks.
 */
export function AmericasIoTLogo({ height = 28, className = "" }: LogoProps) {
  return (
    <img
      src={logoImg}
      alt="Americas IoT"
      draggable={false}
      className={className}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
