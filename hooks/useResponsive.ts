import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Responsive breakpoints based on shortest side (handles rotation)
 * Based on Apple device sizes and React Native best practices
 */
export const BREAKPOINTS = {
  PHONE: 600,      // < 600: Phone
  TABLET: 900,     // 600-900: Tablet (iPad Mini, Air)
  LARGE_TABLET: 1200, // > 900: Large tablet (iPad Pro 12.9")
} as const;

export interface ResponsiveSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface ResponsiveConfig {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isLargeTablet: boolean;
  isSmallPhone: boolean;
  isLargePhone: boolean;
  isLandscape: boolean;
  shortestSide: number;
  longestSide: number;
  insets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  spacing: ResponsiveSpacing;
  gridColumns: number;
  contentMaxWidth: number | undefined;
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
}

/**
 * Hook for responsive design based on device screen size
 * Uses useWindowDimensions for automatic updates on orientation change
 *
 * @returns Responsive configuration object with device info and adaptive values
 */
export const useResponsive = (): ResponsiveConfig => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Use shortest side for breakpoints to handle orientation changes
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);

  // Device type detection
  const isPhone = shortestSide < BREAKPOINTS.PHONE;
  const isTablet = shortestSide >= BREAKPOINTS.PHONE && shortestSide < BREAKPOINTS.LARGE_TABLET;
  const isLargeTablet = shortestSide >= BREAKPOINTS.LARGE_TABLET;

  // More granular phone sizes
  const isSmallPhone = shortestSide < 375;
  const isLargePhone = shortestSide >= 414 && shortestSide < BREAKPOINTS.PHONE;

  // Orientation
  const isLandscape = width > height;

  // Responsive spacing scale
  const spacing: ResponsiveSpacing = {
    xs: isTablet || isLargeTablet ? 6 : 4,
    sm: isTablet || isLargeTablet ? 12 : 8,
    md: isTablet || isLargeTablet ? 24 : 16,
    lg: isTablet || isLargeTablet ? 32 : 24,
    xl: isTablet || isLargeTablet ? 48 : 32,
    xxl: isTablet || isLargeTablet ? 64 : 48,
  };

  // Grid columns for layouts
  const gridColumns = isLargeTablet ? 3 : isTablet ? 2 : 1;

  // Content max width (prevent content stretching too wide on large tablets)
  const contentMaxWidth = isTablet || isLargeTablet ? 1400 : undefined;

  // Responsive font sizes
  const fontSize = {
    xs: isTablet || isLargeTablet ? 11 : 10,
    sm: isTablet || isLargeTablet ? 13 : 12,
    md: isTablet || isLargeTablet ? 15 : 14,
    lg: isTablet || isLargeTablet ? 18 : 16,
    xl: isTablet || isLargeTablet ? 24 : 20,
    xxl: isTablet || isLargeTablet ? 32 : 28,
  };

  return {
    width,
    height,
    isPhone,
    isTablet,
    isLargeTablet,
    isSmallPhone,
    isLargePhone,
    isLandscape,
    shortestSide,
    longestSide,
    insets,
    spacing,
    gridColumns,
    contentMaxWidth,
    fontSize,
  };
};

/**
 * Utility function to get responsive value based on device type
 * Useful for static calculations outside of components
 */
export const getResponsiveValue = <T,>(
  phoneValue: T,
  tabletValue: T,
  largeTabletValue?: T
): T => {
  const { isPhone, isTablet, isLargeTablet } = useResponsive();

  if (isLargeTablet && largeTabletValue !== undefined) {
    return largeTabletValue;
  }

  return isTablet || isLargeTablet ? tabletValue : phoneValue;
};
