import React, { useCallback, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

interface ScrollShadowProps {
  children: React.ReactNode;
  size?: number;
  orientation?: 'horizontal' | 'vertical';
  visibility?: 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'both' | 'none';
  color?: string;
  isEnabled?: boolean;
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export function ScrollShadow({
  children,
  size = 40,
  orientation = 'vertical',
  visibility = 'auto',
  color,
  isEnabled = true,
}: ScrollShadowProps) {
  const { colors, isDark } = useTheme();
  const shadowColor = color || (isDark ? '#000000' : '#ffffff');

  const scrollOffset = useSharedValue(0);
  const contentSize = useSharedValue(0);
  const containerSize = useSharedValue(0);

  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout;
    setContainerHeight(height);
    setContainerWidth(width);
    containerSize.value = orientation === 'vertical' ? height : width;
  }, [orientation, containerSize]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollOffset.value = orientation === 'vertical'
        ? event.contentOffset.y
        : event.contentOffset.x;
      contentSize.value = orientation === 'vertical'
        ? event.contentSize.height
        : event.contentSize.width;
      containerSize.value = orientation === 'vertical'
        ? event.layoutMeasurement.height
        : event.layoutMeasurement.width;
    },
  });

  const topShadowStyle = useAnimatedStyle(() => {
    if (!isEnabled || visibility === 'none' || visibility === 'bottom' || visibility === 'right') {
      return { opacity: 0 };
    }

    const showTop = visibility === 'auto' || visibility === 'both' || visibility === 'top' || visibility === 'left';
    const opacity = showTop ? withTiming(scrollOffset.value > 10 ? 1 : 0, { duration: 150 }) : 0;

    return { opacity };
  });

  const bottomShadowStyle = useAnimatedStyle(() => {
    if (!isEnabled || visibility === 'none' || visibility === 'top' || visibility === 'left') {
      return { opacity: 0 };
    }

    const showBottom = visibility === 'auto' || visibility === 'both' || visibility === 'bottom' || visibility === 'right';
    const maxScroll = contentSize.value - containerSize.value;
    const isAtBottom = scrollOffset.value >= maxScroll - 10;
    const hasOverflow = contentSize.value > containerSize.value;
    const opacity = showBottom && hasOverflow ? withTiming(isAtBottom ? 0 : 1, { duration: 150 }) : 0;

    return { opacity };
  });

  const isVertical = orientation === 'vertical';

  const topGradientColors = [`${shadowColor}`, `${shadowColor}00`] as const;
  const bottomGradientColors = [`${shadowColor}00`, `${shadowColor}`] as const;

  return (
    <View style={styles.container} onLayout={onLayout}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, {
            onScroll: scrollHandler,
            scrollEventThrottle: 16,
          });
        }
        return child;
      })}

      {/* Top/Left Shadow */}
      <AnimatedLinearGradient
        colors={topGradientColors}
        start={isVertical ? { x: 0.5, y: 0 } : { x: 0, y: 0.5 }}
        end={isVertical ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 }}
        style={[
          styles.shadow,
          isVertical ? styles.topShadow : styles.leftShadow,
          { [isVertical ? 'height' : 'width']: size },
          topShadowStyle,
        ]}
        pointerEvents="none"
      />

      {/* Bottom/Right Shadow */}
      <AnimatedLinearGradient
        colors={bottomGradientColors}
        start={isVertical ? { x: 0.5, y: 0 } : { x: 0, y: 0.5 }}
        end={isVertical ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 }}
        style={[
          styles.shadow,
          isVertical ? styles.bottomShadow : styles.rightShadow,
          { [isVertical ? 'height' : 'width']: size },
          bottomShadowStyle,
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
  },
  topShadow: {
    top: 0,
  },
  bottomShadow: {
    bottom: 0,
  },
  leftShadow: {
    top: 0,
    bottom: 0,
    left: 0,
    right: undefined,
  },
  rightShadow: {
    top: 0,
    bottom: 0,
    right: 0,
    left: undefined,
  },
});

export default ScrollShadow;
