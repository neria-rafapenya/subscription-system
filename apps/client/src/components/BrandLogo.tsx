import Svg, { Circle, Path, Rect } from 'react-native-svg';

type BrandLogoProps = { size?: number };

/** Small vector mark that works consistently on iOS, Android and Web. */
export function BrandLogo({ size = 40 }: BrandLogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="WAD Gestoría">
      <Rect x="1" y="1" width="46" height="46" rx="14" fill="#1d4ed8" />
      <Path d="M12 16.5 18.5 32 24 19.8 29.5 32 36 16.5" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      <Circle cx="36" cy="13" r="3.5" fill="#fbbf24" />
    </Svg>
  );
}
