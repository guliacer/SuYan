import appLogo from "@/assets/app-logo.png";

type AppLogoMarkProps = {
  className?: string;
  iconSize?: number;
};

export function AppLogoMark({ className = "size-7" }: AppLogoMarkProps) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${className}`}
    >
      <img src={appLogo} alt="" className="size-full object-cover" draggable={false} />
    </span>
  );
}
