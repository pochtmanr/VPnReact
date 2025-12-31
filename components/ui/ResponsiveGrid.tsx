import React from 'react';
import { View, ViewStyle, StyleSheet, DimensionValue } from 'react-native';
import { useResponsive } from '@/hooks/useResponsive';

interface ResponsiveGridProps {
  children: React.ReactNode;
  /**
   * Number of columns for phone, tablet, and large tablet
   * If not specified, uses automatic grid columns from useResponsive
   */
  columns?: {
    phone?: number;
    tablet?: number;
    largeTablet?: number;
  };
  /**
   * Gap between grid items
   */
  gap?: number;
  /**
   * Additional styles for the container
   */
  style?: ViewStyle;
  /**
   * Horizontal padding for the grid
   */
  paddingHorizontal?: number;
}

/**
 * Responsive grid component that automatically adjusts columns based on screen size
 * Uses flexbox with wrap for optimal performance
 *
 * Example usage:
 * <ResponsiveGrid gap={12}>
 *   <Widget1 />
 *   <Widget2 />
 *   <Widget3 />
 * </ResponsiveGrid>
 */
export const ResponsiveGrid: React.FC<ResponsiveGridProps> = ({
  children,
  columns,
  gap = 12,
  style,
  paddingHorizontal,
}) => {
  const { isPhone, isTablet, isLargeTablet, spacing } = useResponsive();

  // Determine number of columns
  let numColumns: number;
  if (columns) {
    if (isLargeTablet && columns.largeTablet) {
      numColumns = columns.largeTablet;
    } else if (isTablet && columns.tablet) {
      numColumns = columns.tablet;
    } else {
      numColumns = columns.phone || 1;
    }
  } else {
    // Auto columns: 1 for phone, 2 for tablet, 3 for large tablet
    numColumns = isLargeTablet ? 3 : isTablet ? 2 : 1;
  }

  const padding = paddingHorizontal ?? spacing.md;

  // Calculate item width accounting for gaps
  const itemWidth: DimensionValue = numColumns === 1
    ? '100%'
    : `${(100 / numColumns) - ((gap * (numColumns - 1)) / numColumns / numColumns * 100)}%` as DimensionValue;

  return (
    <View
      style={[
        styles.container,
        {
          gap,
          paddingHorizontal: padding,
        },
        style,
      ]}
    >
      {React.Children.map(children, (child, index) => {
        if (!child) return null;

        // Calculate if item should have right margin (not last item in row)
        const isLastInRow = (index + 1) % numColumns === 0;

        return (
          <View
            style={[
              {
                width: itemWidth,
                marginBottom: gap,
              },
              // Remove right margin for last item in row
              !isLastInRow && numColumns > 1 && { marginRight: gap },
            ]}
          >
            {child}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
});

interface ResponsiveContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /**
   * Center content with max width on tablets
   */
  centerContent?: boolean;
}

/**
 * Container that centers content and applies max-width on tablets
 * Useful for preventing content from stretching too wide on large screens
 */
export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  style,
  centerContent = true,
}) => {
  const { contentMaxWidth, spacing } = useResponsive();

  return (
    <View
      style={[
        {
          width: '100%',
          paddingHorizontal: spacing.md,
        },
        centerContent && {
          maxWidth: contentMaxWidth,
          alignSelf: 'center',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};
